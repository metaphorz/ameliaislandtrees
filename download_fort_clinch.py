"""Download the public DEP Fort Clinch maritime-hammock polygons."""
import datetime
import json
from pathlib import Path
from download_inventory import get

URL = 'https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/5'
WHERE = "SITE_NAME = 'Fort Clinch State Park' AND EC_CODE = 'MAH'"


def main():
    metadata = get(URL, f='json')
    ids = sorted(get(URL + '/query', where=WHERE, returnIdsOnly='true', f='json')['objectIds'])
    assert ids, 'No maritime hammock found'
    features = []
    for start in range(0, len(ids), 100):
        page = get(URL + '/query', objectIds=','.join(map(str, ids[start:start+100])),
                   outFields='*', returnGeometry='true', outSR=4326, f='geojson')
        assert not page.get('exceededTransferLimit')
        features.extend(page['features'])
    actual = [f['properties']['OBJECTID'] for f in features]
    assert len(actual) == len(set(actual)) == len(ids) and set(actual) == set(ids)
    for f in features:
        assert f['geometry']['type'] in ('Polygon', 'MultiPolygon')
        assert f['properties']['SITE_NAME'] == 'Fort Clinch State Park'
        assert f['properties']['EC_CODE'] == 'MAH'
    folder = Path(__file__).resolve().parent / 'data' / 'fort-clinch'
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'url': URL, 'where': WHERE, 'count': len(features),
                'recorded_acres': sum(f['properties']['ACREAGE'] for f in features),
                'attribution': 'Florida DEP Division of Recreation and Parks',
                'note': 'Mapped maritime-hammock habitat, not individual trees or measured canopy cover. Retrieval date is not a survey date.'}
    for name, data in [('maritime-hammock.geojson', {'type': 'FeatureCollection', 'features': features}),
                       ('metadata.json', metadata), ('sources.json', manifest)]:
        (folder / name).write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
