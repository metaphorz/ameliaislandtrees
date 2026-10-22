"""Download iNaturalist tree observations for unincorporated Amelia Island.

Requires Python 3 and curl. Run: python3 download_unincorporated.py
The island outline is the union of Nassau County census tracts 501.xx and 502.xx;
points inside the City of Fernandina Beach boundary are excluded. Observations
already in the Omni project layer are excluded to avoid duplicate markers.
"""
import datetime
import json
import math
from pathlib import Path
import re
import subprocess
import urllib.parse

ROOT = Path(__file__).resolve().parent / 'data' / 'unincorporated'
COUNTY = 'https://services5.arcgis.com/F73IhFZbCCYUexxB/arcgis/rest/services/'
TRACTS = COUNTY + 'Census_Tracts/FeatureServer/18'
CITY = COUNTY + 'MunicipalBoundary/FeatureServer/8'
BBOX = (-81.50, 30.50, -81.41, 30.72)
OMNI_PROJECT = 232346
REPEAT_METRES = 5
# Genera whose northeast-Florida members are trees or tree-forming (some small trees
# such as wax myrtle and yaupon holly are included).
GENERA = ['Quercus', 'Pinus', 'Sabal', 'Juniperus', 'Magnolia', 'Celtis', 'Carya', 'Acer',
          'Persea', 'Liquidambar', 'Cinnamomum', 'Prunus', 'Nyssa', 'Taxodium', 'Ulmus',
          'Morella', 'Ilex', 'Fraxinus', 'Platanus', 'Liriodendron', 'Salix', 'Diospyros',
          'Zanthoxylum', 'Sideroxylon', 'Osmanthus', 'Gordonia', 'Tilia', 'Carpinus',
          'Ostrya', 'Cercis', 'Cornus', 'Triadica', 'Melia', 'Albizia', 'Phoenix',
          'Washingtonia', 'Butia', 'Lagerstroemia', 'Eriobotrya', 'Citrus', 'Morus',
          'Ficus', 'Cupressus', 'Chamaecyparis', 'Gleditsia', 'Robinia']


def get(url, **params):
    raw = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '90',
                          '--retry', '2', '-A', 'AmeliaIslandTreeAtlas/1.0',
                          url + ('?' + urllib.parse.urlencode(params) if params else '')],
                         check=True, capture_output=True).stdout
    result = json.loads(raw)
    if isinstance(result, dict) and 'error' in result:
        raise RuntimeError(result['error'])
    return result


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2))


def rings(geometry):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return [polygon for polygon in polygons]


def inside_ring(x, y, ring):
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def inside(x, y, polygons):
    # First ring is the outer boundary; any later rings are holes.
    return any(inside_ring(x, y, p[0]) and not any(inside_ring(x, y, h) for h in p[1:]) for p in polygons)


def boundaries():
    tracts = get(TRACTS + '/query', where="TRACTCE LIKE '0501%' OR TRACTCE LIKE '0502%'",
                 outFields='TRACTCE,NAMELSAD', returnGeometry='true', outSR=4326, f='geojson')
    city = get(CITY + '/query', where="NAME = 'City of Fernandina Beach'", outFields='NAME',
               returnGeometry='true', outSR=4326, f='geojson')
    assert tracts['features'] and len(city['features']) == 1, 'Boundary query returned no features'
    island = [p for f in tracts['features'] for p in rings(f['geometry'])]
    return island, rings(city['features'][0]['geometry']), tracts, city


def genus_ids():
    ids = {}
    for name in GENERA:
        matches = [t for t in get('https://api.inaturalist.org/v1/taxa', q=name, rank='genus', per_page=30)['results']
                   if t['name'] == name and t.get('iconic_taxon_name') == 'Plantae']
        assert matches, f'No iNaturalist plant genus named {name}'
        ids[name] = matches[0]['id']
    return ids


def observations(taxa, **extra):
    found, after = [], 0
    while True:
        batch = get('https://api.inaturalist.org/v1/observations', taxon_id=','.join(map(str, taxa)),
                    swlng=BBOX[0], swlat=BBOX[1], nelng=BBOX[2], nelat=BBOX[3], per_page=200,
                    order_by='id', order='asc', id_above=after, **extra)['results']
        found.extend(batch)
        if len(batch) < 200:
            return found
        after = batch[-1]['id']


def metres(a, b):
    (x1, y1), (x2, y2) = a, b
    return math.hypot((x1 - x2) * 111320 * math.cos(math.radians((y1 + y2) / 2)), (y1 - y2) * 110574)


def merge_repeats(features):
    """Treat same-taxon observations within REPEAT_METRES as sightings of one tree."""
    groups = []
    for feature in features:
        point, taxon = feature['geometry']['coordinates'], feature['properties']['taxon_id']
        group = next((g for g in groups if g[0]['properties']['taxon_id'] == taxon and
                      any(metres(point, f['geometry']['coordinates']) <= REPEAT_METRES for f in g)), None)
        if group is None:
            groups.append([feature])
        else:
            group.append(feature)
    merged = []
    rank = {'research': 2, 'needs_id': 1}
    for group in groups:
        # Keep the best-supported, most recent sighting; link the others from its popup.
        group.sort(key=lambda f: (rank.get(f['properties']['quality_grade'], 0), f['properties']['observed_on'] or ''), reverse=True)
        keep = group[0]
        keep['properties']['repeat_sightings'] = [{'uri': f['properties']['uri'], 'observed_on': f['properties']['observed_on']}
                                                  for f in group[1:]]
        merged.append(keep)
    return merged, len(features) - len(merged)


def main():
    island, city, tracts, city_geojson = boundaries()
    taxa = genus_ids()
    raw = observations(taxa.values())
    expected = get('https://api.inaturalist.org/v1/observations', taxon_id=','.join(map(str, taxa.values())),
                   swlng=BBOX[0], swlat=BBOX[1], nelng=BBOX[2], nelat=BBOX[3], per_page=0)['total_results']
    assert len({o['id'] for o in raw}) == len(raw) == expected, 'iNaturalist count mismatch'
    omni = {o['id'] for o in observations(taxa.values(), project_id=OMNI_PROJECT)}
    features, excluded = [], {'outside_island': 0, 'inside_city': 0, 'omni_project': 0, 'no_location': 0, 'obscured': 0}
    for o in raw:
        if not o.get('geojson'):
            excluded['no_location'] += 1
            continue
        # An obscured point is randomized within a ~20 km cell, so it cannot be placed
        # inside or outside the city limits.
        if o.get('obscured') or o.get('geoprivacy') in ('obscured', 'private') or o.get('taxon_geoprivacy') in ('obscured', 'private'):
            excluded['obscured'] += 1
            continue
        x, y = o['geojson']['coordinates']
        reason = ('omni_project' if o['id'] in omni else 'outside_island' if not inside(x, y, island)
                  else 'inside_city' if inside(x, y, city) else None)
        if reason:
            excluded[reason] += 1
            continue
        taxon = o.get('taxon') or {}
        # Large (1024 px) images keep popups light; originals stay at the source link.
        photos = [{'id': p['id'], 'license_code': p.get('license_code'), 'attribution': p.get('attribution'),
                   'url': re.sub(r'/square\.', '/large.', p['url'])} for p in o.get('photos', [])]
        properties = {key: o.get(key) for key in ['id', 'uri', 'observed_on', 'quality_grade', 'license_code',
                      'geoprivacy', 'obscured', 'positional_accuracy', 'captive', 'description']}
        properties.update({'scientific_name': taxon.get('name'), 'common_name': taxon.get('preferred_common_name'),
                           'taxon_id': taxon.get('id'), 'taxon_rank': taxon.get('rank'),
                           'observer': o.get('user', {}).get('login'), 'photos': photos})
        features.append({'type': 'Feature', 'id': o['id'], 'geometry': o['geojson'], 'properties': properties})
    features, repeats = merge_repeats(features)
    save(ROOT / 'inaturalist-trees.geojson', {'type': 'FeatureCollection', 'features': features})
    save(ROOT / 'island-tracts.geojson', tracts)
    save(ROOT / 'fernandina-city-limits.geojson', city_geojson)
    save(ROOT / 'sources.json', {
        'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'island_outline': {'url': TRACTS, 'tracts': sorted(f['properties']['TRACTCE'] for f in tracts['features'])},
        'city_limits': CITY, 'inaturalist_bbox': BBOX, 'genera': taxa,
        'observations_in_bbox': len(raw), 'excluded': excluded, 'repeat_sightings_merged': repeats,
        'records': len(features)})
    print(f'{len(features)} unincorporated-island trees; {repeats} repeat sightings merged; excluded {excluded}', flush=True)


if __name__ == '__main__':
    main()
