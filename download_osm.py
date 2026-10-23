"""Download OpenStreetMap tree points and woodland areas on Amelia Island.

Requires Python 3 and curl. Run: python3 download_osm.py
Features are kept when they fall on the island (census tracts 501.xx/502.xx,
data/unincorporated/island-tracts.geojson). OpenStreetMap data are (c) OpenStreetMap
contributors, available under the Open Database License (ODbL).
"""
import datetime
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent / 'data' / 'osm'
ISLAND = Path(__file__).resolve().parent / 'data' / 'unincorporated' / 'island-tracts.geojson'
OVERPASS = 'https://overpass-api.de/api/interpreter'
BBOX = '30.49,-81.50,30.72,-81.41'
QUERY = f'''[out:json][timeout:120];
(node["natural"="tree"]({BBOX});way["natural"="tree_row"]({BBOX});way["natural"="wood"]({BBOX});way["landuse"="forest"]({BBOX}););
out tags geom;'''


def inside_ring(x, y, ring):
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def on_island(x, y, polygons):
    return any(inside_ring(x, y, p[0]) and not any(inside_ring(x, y, h) for h in p[1:]) for p in polygons)


def main():
    island = []
    for f in json.loads(ISLAND.read_text())['features']:
        g = f['geometry']
        island.extend([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'])
    raw = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '180', '--retry', '2',
                          '-A', 'AmeliaIslandTreeAtlas/1.0', OVERPASS, '--data-urlencode', 'data=' + QUERY],
                         check=True, capture_output=True).stdout
    elements = json.loads(raw)['elements']
    trees, woods, outside = [], [], 0
    for e in elements:
        tags = e.get('tags', {})
        if e['type'] == 'node':
            if not on_island(e['lon'], e['lat'], island):
                outside += 1
                continue
            trees.append({'type': 'Feature', 'id': e['id'],
                          'geometry': {'type': 'Point', 'coordinates': [e['lon'], e['lat']]},
                          'properties': {'osm_id': e['id'], 'osm_type': 'node', **tags}})
            continue
        coords = [[p['lon'], p['lat']] for p in e.get('geometry', [])]
        if len(coords) < 2:
            continue
        # Keep a way when its vertex average lies on the island.
        cx, cy = sum(c[0] for c in coords) / len(coords), sum(c[1] for c in coords) / len(coords)
        if not on_island(cx, cy, island):
            outside += 1
            continue
        closed = coords[0] == coords[-1] and len(coords) >= 4 and tags.get('natural') != 'tree_row'
        woods.append({'type': 'Feature', 'id': e['id'],
                      'geometry': {'type': 'Polygon', 'coordinates': [coords]} if closed else {'type': 'LineString', 'coordinates': coords},
                      'properties': {'osm_id': e['id'], 'osm_type': 'way', **tags}})
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'trees.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': trees}))
    (ROOT / 'woodland.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': woods}))
    (ROOT / 'sources.json').write_text(json.dumps({
        'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'api': OVERPASS, 'query': QUERY,
        'license': 'Open Database License (ODbL) 1.0; (c) OpenStreetMap contributors', 'trees': len(trees),
        'woodland_features': len(woods), 'outside_island': outside}, indent=2))
    print(f'{len(trees)} tree points, {len(woods)} woodland features on the island; {outside} outside')


if __name__ == '__main__':
    main()
