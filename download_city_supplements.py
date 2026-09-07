"""Download and verify city heritage, planting, and nomination snapshots."""
import datetime
import json
import math
from collections import defaultdict
from pathlib import Path
from download_inventory import get, ROOT

SOURCES = {
    'heritage': 'HeritageTrees',
    'city-plantings': 'PlantedTrees',
    'nominations': 'HeritageTreeNominationEvaluation',
}


def audit_overlaps(folder):
    """Find nearby records for review; proximity never establishes tree identity."""
    city_path = folder.parent / 'fernandina-trees.geojson'
    city = json.loads(city_path.read_text())['features']
    cells = defaultdict(list)
    step = 0.0001
    for f in city:
        g = f.get('geometry')
        if not g or g['type'] != 'Point':
            continue
        x, y = g['coordinates'][:2]
        cells[math.floor(x/step), math.floor(y/step)].append(f)
    audit = {'method': 'Public point locations within 5 meters, approximate local equirectangular distance. Candidates only; no identity match or deduplication is asserted.',
             'threshold_m': 5, 'sources': {}}
    for name in SOURCES:
        features = json.loads((folder / f'{name}.geojson').read_text())['features']
        matches = {}
        for f in features:
            g = f.get('geometry')
            if not g or g['type'] != 'Point':
                continue
            x,y = g['coordinates'][:2]
            cx,cy = math.floor(x/step), math.floor(y/step)
            nearby = []
            for i in range(cx-1,cx+2):
                for j in range(cy-1,cy+2):
                    for other in cells.get((i,j),[]):
                        ox,oy = other['geometry']['coordinates'][:2]
                        d = math.hypot((x-ox)*111320*math.cos(math.radians(y)), (y-oy)*111320)
                        if d <= 5:
                            p=other['properties']
                            nearby.append({'city_object_id':p['objectid'], 'tree_number':p['tree_no'], 'distance_m':round(d,2)})
            if nearby:
                matches[str(f['properties']['objectid'])] = sorted(nearby,key=lambda r:r['distance_m'])
        audit['sources'][name] = {'records':len(features), 'records_with_nearby_city_points':len(matches), 'candidates':matches}
    (folder / 'overlap-audit.json').write_text(json.dumps(audit, indent=2))


def main():
    folder = Path(__file__).resolve().parent / 'data' / 'city-supplements'
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sources': {}}
    for name, service in SOURCES.items():
        url = ROOT + service + '/FeatureServer/0'
        metadata = get(url, f='json')
        ids = sorted(get(url + '/query', where='1=1', returnIdsOnly='true', f='json').get('objectIds') or [])
        features = []
        for start in range(0, len(ids), 500):
            batch = ids[start:start+500]
            response = get(url + '/query', objectIds=','.join(map(str, batch)), outFields='*', outSR=4326, f='geojson')
            assert not response.get('exceededTransferLimit') and len(response['features']) == len(batch), name
            features.extend(response['features'])
        actual = [f['properties'][metadata['objectIdField']] for f in features]
        assert len(actual) == len(set(actual)) == len(ids) and set(actual) == set(ids), name
        attachments = []
        if metadata.get('hasAttachments') and ids:
            for start in range(0, len(ids), 100):
                response = get(url + '/queryAttachments', objectIds=','.join(map(str, ids[start:start+100])), returnUrl='true', f='json')
                assert not response.get('exceededTransferLimit'), name
                for group in response.get('attachmentGroups', []):
                    for a in group.get('attachmentInfos', []):
                        attachments.append({**a, 'parent_object_id': group['parentObjectId'],
                                            'url': a.get('url') or f"{url}/{group['parentObjectId']}/attachments/{a['id']}"})
            counts = get(url + '/queryAttachments', definitionExpression='1=1', returnCountOnly='true', f='json')
            assert not counts.get('exceededTransferLimit')
            assert sum(g['count'] for g in counts.get('attachmentGroups', [])) == len(attachments), name
        for suffix, data in [('geojson', {'type':'FeatureCollection','features':features}),
                             ('metadata.json',metadata), ('attachments.json',attachments)]:
            (folder / f'{name}.{suffix}').write_text(json.dumps(data, indent=2))
        manifest['sources'][name] = {'url':url, 'count':len(features), 'attachments':len(attachments)}
        print(f'{name}: {len(features)} records, {len(attachments)} attachments verified', flush=True)
    (folder / 'sources.json').write_text(json.dumps(manifest, indent=2))
    audit_overlaps(folder)


if __name__ == '__main__':
    main()
