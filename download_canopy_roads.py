"""Download Nassau County's designated canopy/scenic roads as map lines.

Requires Python 3 and curl. Run: python3 download_canopy_roads.py
Road centerlines come from the county's public road network (Nassau County Property
Appraiser GIS). Each road is cut to the stretch its designating ordinance names and to
land outside Fernandina Beach city limits, since the designations cover unincorporated
county roads only. Ordinance links open the Clerk's PDF directly.
"""
import datetime
import json
import math
from pathlib import Path
import subprocess
import urllib.parse

HERE = Path(__file__).resolve().parent
ROOT = HERE / 'data' / 'canopy-roads'
CITY = HERE / 'data' / 'unincorporated' / 'fernandina-city-limits.geojson'
ROADS = 'https://maps.ncpafl.com/ncflpa_arcgis/rest/services/NASSAUADMIN_RoadNetwork/FeatureServer/15'
CLERK = 'https://files.nassauclerk.com/download.cfm?file='

# Junction of Amelia Island Parkway and S Fletcher Avenue (A1A), north of the Ritz-Carlton.
PARKWAY_A1A_LAT = 30.59811

# Every designation through 2024. Ordinance 2024-15 restates the full earlier list.
DESIGNATIONS = [
    {'name': 'Amelia Island Parkway', 'road': 'AMELIA ISLAND PKWY', 'ordinance': '2003-01',
     'file': r'Ordinances\2003 Ordinances\Ordinance No. 2003-01.pdf', 'color': '#c2410c',
     'extent': 'From the light at A1A north of the Ritz-Carlton, south to where the Parkway meets A1A again just south of Julia Street.',
     'cut': 'parkway'},
    {'name': 'Scott Road', 'road': 'SCOTT RD', 'ordinance': '2003-02',
     'file': r'Ordinances\2003 Ordinances\Ordinance No. 2003-02.pdf', 'color': '#1d4ed8',
     'extent': 'From A1A east to Amelia Island Parkway.'},
    {'name': 'Gerbing Road', 'road': 'GERBING RD', 'ordinance': '2004-08',
     'file': r'Ordinances\2004 Ordinances\Ordinance No. 2004-08.pdf', 'color': '#7c3aed',
     'extent': 'From A1A to the end of the public right-of-way.'},
    {'name': 'Buccaneer Trail (CR 105A)', 'road': 'BUCCANEER TR', 'ordinance': '2004-29',
     'file': r'Ordinances\2004 Ordinances\Ordinance No. 2004-29.pdf', 'color': '#be123c',
     'extent': 'From Fletcher Avenue/A1A and Gerbing Road north to the Fernandina Beach city limits.'},
    {'name': 'Manucy Road', 'road': 'MANUCY RD', 'ordinance': '2005-59',
     'file': r'Ordinances\2005 Ordinances\Ordinance No. 2005-59.pdf', 'color': '#0f766e',
     'extent': 'From First Coast Highway to the end of the public right-of-way.'},
    {'name': 'Suarez Bluff Road', 'road': 'SUAREZ BLUFF RD', 'ordinance': '2005-60',
     'file': r'Ordinances\2005 Ordinances\Ordinance No. 2005-60.pdf', 'color': '#a16207',
     'extent': 'From Forrest Drive to Manucy Road.'},
    {'name': 'Meadowfield Bluff Road', 'road': 'MEADOWFIELD BLUFFS RD', 'ordinance': '2008-13',
     'file': r'Ordinances\2008 Ordinances\Ordinance No. 2008-13.pdf', 'color': '#4d7c0f',
     'extent': 'From A1A to 2,100 feet south of A1A, measured along the centerline. On the mainland near Yulee.',
     'zone': 'The county right-of-way, including trees within 10 feet outside it.', 'cut': 'meadowfield'},
    {'name': 'Anthony Street', 'road': 'ANTHONY ST', 'ordinance': '2019-22',
     'file': r'Ordinances\2019 Ordinances\Ordinance 2019-22.pdf', 'color': '#db2777',
     'extent': 'The whole street.', 'zone': 'The county right-of-way plus 20 feet on each side.'},
    {'name': 'Karen Street', 'road': 'KAREN ST', 'ordinance': '2019-23',
     'file': r'Ordinances\2019 Ordinances\Ordinance 2019-23.pdf', 'color': '#0369a1',
     'extent': 'The whole street.', 'zone': 'The county right-of-way plus 20 feet on each side.'},
    {'name': 'Orange Avenue', 'road': 'ORANGE AV', 'ordinance': '2019-24',
     'file': r'Ordinances\2019 Ordinances\Ordinance 2019-24.pdf', 'color': '#ea580c',
     'extent': 'The county-maintained street.',
     'zone': 'The county right-of-way plus 10 or 20 feet, depending on the adjoining parcel.', 'county_only': True},
    {'name': 'Shadow Woods Lane', 'road': 'SHADOW WOODS LN', 'ordinance': '2024-15',
     'file': r'Ordinances\2024 Ordinances\Ordinance 2024-015 AM.pdf', 'color': '#15803d',
     'extent': 'The whole street.', 'zone': 'The right-of-way plus 20 feet on each side.'},
]


def query(road):
    params = urllib.parse.urlencode({
        'where': f"NAME_CAPS = '{road}'", 'outFields': 'OBJECTID,NAME_CAPS,MAINTENANCE',
        'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson'})
    raw = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '120', '--retry', '2',
                          f'{ROADS}/query?{params}'], check=True, capture_output=True).stdout
    return json.loads(raw)['features']


def lines_of(feature):
    g = feature['geometry']
    return [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']


def inside_ring(x, y, ring):
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def meters(a, b):
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 110540)


def chain(lines):
    """Join segments that share end points into as few lines as possible."""
    lines = [list(map(tuple, l)) for l in lines if len(l) > 1]
    joined = True
    while joined:
        joined = False
        for i in range(len(lines)):
            for j in range(len(lines)):
                if i == j:
                    continue
                a, b = lines[i], lines[j]
                if meters(a[-1], b[0]) < 1:
                    lines[i] = a + b[1:]
                elif meters(a[-1], b[-1]) < 1:
                    lines[i] = a + b[::-1][1:]
                else:
                    continue
                del lines[j]
                joined = True
                break
            if joined:
                break
    return lines


def keep(lines, test):
    """Split lines into runs of points that pass the test."""
    out = []
    for line in lines:
        run = []
        for p in line:
            if test(p):
                run.append(p)
            else:
                if len(run) > 1:
                    out.append(run)
                run = []
        if len(run) > 1:
            out.append(run)
    return out


def first_meters(lines, length):
    """The first `length` meters of the road, measured from its northern end."""
    line = max(chain(lines), key=len)
    if line[0][1] < line[-1][1]:
        line = line[::-1]
    out, total = [line[0]], 0
    for a, b in zip(line, line[1:]):
        step = meters(a, b)
        if total + step >= length:
            t = (length - total) / step
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            return [out]
        out.append(b)
        total += step
    return [out]


def length_miles(lines):
    return sum(meters(a, b) for l in lines for a, b in zip(l, l[1:])) / 1609.344


def main():
    city = json.loads(CITY.read_text())['features'][0]['geometry']['coordinates']
    outside_city = lambda p: not (inside_ring(p[0], p[1], city[0]) and not any(inside_ring(p[0], p[1], h) for h in city[1:]))
    features, counts = [], {}
    for d in DESIGNATIONS:
        found = query(d['road'])
        if d.get('county_only'):
            found = [f for f in found if f['properties']['MAINTENANCE'] == 'County']
        lines = chain([l for f in found for l in lines_of(f)])
        if d.get('cut') == 'parkway':
            lines = keep(lines, lambda p: p[1] <= PARKWAY_A1A_LAT + 0.00002)
        elif d.get('cut') == 'meadowfield':
            lines = first_meters(lines, 2100 * 0.3048)
        lines = keep(lines, outside_city)
        if not lines:
            raise SystemExit(f'No geometry left for {d["name"]}')
        counts[d['name']] = len(found)
        features.append({'type': 'Feature', 'geometry': {
            'type': 'MultiLineString', 'coordinates': [[[round(x, 6), round(y, 6)] for x, y in l] for l in lines]},
            'properties': {
                'name': d['name'], 'ordinance': d['ordinance'], 'color': d['color'], 'extent': d['extent'],
                'zone': d.get('zone'), 'url': CLERK + urllib.parse.quote_plus(d['file']),
                'miles': round(length_miles(lines), 2)}})
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'canopy-roads.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}))
    (ROOT / 'sources.json').write_text(json.dumps({
        'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'road_network': ROADS,
        'city_limits': str(CITY.relative_to(HERE)), 'segments_per_road': counts}, indent=2))
    for f in features:
        print(f"{f['properties']['name']}: {f['properties']['miles']} mi")


if __name__ == '__main__':
    main()
