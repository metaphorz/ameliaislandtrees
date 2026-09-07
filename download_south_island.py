"""Download public south-island environmental datasets and their media.

Requires Python 3 and curl. Run: python3 download_south_island.py
Outputs remain separate from the published city inventory.
"""
import concurrent.futures
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import urllib.parse

ROOT = Path(__file__).resolve().parent / 'data' / 'south-island'
BASE = 'https://services5.arcgis.com/F73IhFZbCCYUexxB/arcgis/rest/services/'
LAYERS = {
    'aipca-planting-locations': BASE + 'survey123_0c8553b37d0a463292d73320b279b062_results/FeatureServer/0',
    'aipca-invasive-plant-reports': BASE + 'survey123_e8453fc4d87c4399a4397387be173925/FeatureServer/0',
    'aipca-boundary': BASE + 'AIPCABoundary/FeatureServer/199',
}
RCOAST = 'https://www.r-coast.com/case-study/2025-aipca-natural-resources-inventory'


def fetch(url):
    return subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
                           '--max-time', '90', '--retry', '2', url],
                          check=True, capture_output=True).stdout


def get(url, **params):
    result = json.loads(fetch(url + ('?' + urllib.parse.urlencode(params) if params else '')))
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2))


def arcgis(name, url, media):
    folder = ROOT / name
    metadata = get(url, f='json')
    save(folder / 'metadata.json', metadata)
    ids = sorted(get(url + '/query', where='1=1', returnIdsOnly='true', f='json').get('objectIds') or [])
    features = []
    for start in range(0, len(ids), 500):
        batch = ids[start:start + 500]
        result = get(url + '/query', objectIds=','.join(map(str, batch)),
                     outFields='*', returnGeometry='true', outSR=4326, f='geojson')
        if result.get('exceededTransferLimit') or len(result.get('features', [])) != len(batch):
            raise RuntimeError(f'Incomplete features: {name}')
        features.extend(result['features'])
    actual = [f['properties'][metadata['objectIdField']] for f in features]
    assert len(actual) == len(set(actual)) == len(ids) and set(actual) == set(ids), name
    save(folder / 'features.geojson', {'type': 'FeatureCollection', 'features': features})
    attachments = []
    if metadata.get('hasAttachments'):
        # Per-record listing avoids attachment pagination/transfer-limit ambiguity.
        for oid in ids:
            response = get(f'{url}/{oid}/attachments', f='json')
            for attachment in response.get('attachmentInfos', []):
                ext = Path(attachment['name']).suffix.lower()
                if not re.fullmatch(r'\.[a-z0-9]{1,8}', ext):
                    ext = '.bin'
                relative = f'{name}/attachments/{oid}-{attachment["id"]}{ext}'
                entry = {'parent_object_id': oid, **attachment,
                         'url': f'{url}/{oid}/attachments/{attachment["id"]}',
                         'local_path': relative}
                attachments.append(entry)
                media.append(entry)
    save(folder / 'attachments.json', attachments)
    print(f'{name}: {len(features)} verified features; {len(attachments)} attachments', flush=True)
    return {'url': url, 'records': len(features), 'attachments': len(attachments)}


def inaturalist(media):
    folder = ROOT / 'omni-inaturalist'
    project = get('https://api.inaturalist.org/v1/projects/omni-amelia-island')
    save(folder / 'project.json', project)
    observations, after = [], 0
    while True:
        result = get('https://api.inaturalist.org/v1/observations', project_id=232346,
                     per_page=200, order_by='id', order='asc', id_above=after)
        batch = result['results']
        observations.extend(batch)
        if len(batch) < 200:
            break
        after = batch[-1]['id']
    expected = get('https://api.inaturalist.org/v1/observations', project_id=232346, per_page=1)['total_results']
    assert len({o['id'] for o in observations}) == len(observations) == expected, 'iNaturalist count mismatch'
    save(folder / 'observations.json', observations)
    features, images = [], {}
    for o in observations:
        taxon = o.get('taxon') or {}
        photos = []
        for photo in o.get('photos', []):
            pid = photo['id']
            original = re.sub(r'/square\.', '/original.', photo['url'])
            relative = f'omni-inaturalist/photos/{pid}{Path(urllib.parse.urlsplit(original).path).suffix}'
            entry = {**photo, 'url': original, 'local_path': relative}
            photos.append(entry)
            images[pid] = entry
        properties = {key: o.get(key) for key in ['id', 'uri', 'observed_on', 'time_observed_at',
                      'quality_grade', 'license_code', 'geoprivacy', 'obscured',
                      'positional_accuracy', 'captive', 'description']}
        properties.update({'scientific_name': taxon.get('name'),
                           'common_name': taxon.get('preferred_common_name'),
                           'taxon_id': taxon.get('id'), 'taxon_rank': taxon.get('rank'),
                           'observer': o.get('user', {}).get('login'), 'photos': photos})
        features.append({'type': 'Feature', 'id': o['id'], 'geometry': o.get('geojson'), 'properties': properties})
    save(folder / 'observations.geojson', {'type': 'FeatureCollection', 'features': features})
    save(folder / 'photos.json', list(images.values()))
    media.extend(images.values())
    print(f'Omni iNaturalist: {len(observations)} verified observations; {len(images)} unique photos', flush=True)
    return {'url': 'https://www.inaturalist.org/projects/omni-amelia-island',
            'api': 'https://api.inaturalist.org/v1/observations?project_id=232346',
            'records': len(observations), 'photos': len(images)}


def rcoast(media):
    html = fetch(RCOAST).decode()
    folder = ROOT / 'rcoast'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'source-page.html').write_text(html)
    class Gallery(HTMLParser):
        active = False
        urls = []
        def handle_starttag(self, tag, attrs):
            if tag == 'script':
                self.active = dict(attrs).get('type') == 'application/json'
        def handle_endtag(self, tag):
            if tag == 'script':
                self.active = False
        def handle_data(self, data):
            if self.active:
                obj = json.loads(data)
                self.urls.extend(x['url'] for x in obj.get('items', []) if x.get('type') == 'image')
    gallery = Gallery()
    gallery.feed(html)
    images = [{'url': url, 'source_page': RCOAST,
               'local_path': 'rcoast/graphics/' + Path(urllib.parse.urlsplit(url).path).name}
              for url in dict.fromkeys(gallery.urls)]
    media.extend(images)
    save(folder / 'graphics.json', images)
    return {'url': RCOAST, 'report_graphics': len(images),
            'raw_gis_status': 'No public download for LiDAR, DEM, orthomosaic, or GIS source files found on the case-study page.'}


def download_media(entry):
    path = ROOT / entry['local_path']
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if not path.exists():
            data = fetch(entry['url'])
            if not data or data.lstrip().startswith((b'<!DOCTYPE html', b'<html', b'{"error"')):
                raise RuntimeError('Non-media response')
            if entry.get('size') is not None and len(data) != entry['size']:
                raise RuntimeError('Attachment byte count mismatch')
            path.write_bytes(data)
        data = path.read_bytes()
        return {**entry, 'download_status': 'ok', 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest()}
    except Exception as error:
        return {**entry, 'download_status': 'failed', 'error': str(error)}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sources': {}}
    media = []
    for name, url in LAYERS.items():
        manifest['sources'][name] = arcgis(name, url, media)
    manifest['sources']['omni-inaturalist'] = inaturalist(media)
    manifest['sources']['rcoast'] = rcoast(media)
    save(ROOT / 'sources.json', manifest)
    print(f'Downloading {len(media)} media files…', flush=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for result in executor.map(download_media, media):
            results.append(result)
            if len(results) % 25 == 0:
                print(f'Media: {len(results)}/{len(media)}', flush=True)
    save(ROOT / 'media-manifest.json', results)
    failures = [r for r in results if r['download_status'] != 'ok']
    print(f'Complete: {len(results) - len(failures)} media files downloaded; {len(failures)} failures.', flush=True)
    if failures:
        raise RuntimeError(f'{len(failures)} failed media downloads; see media-manifest.json')


if __name__ == '__main__':
    main()
