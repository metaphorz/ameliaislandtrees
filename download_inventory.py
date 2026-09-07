"""Download public tree inventory snapshots; requires Python 3 and curl.

Run: python3 download_inventory.py
"""
import datetime
import json
from pathlib import Path
import urllib.parse
import subprocess

ROOT = "https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/"
SOURCES = {
    "fernandina-trees": ROOT + "COFBTreeInventy2023Updates/FeatureServer/0",
    "county-trees": ROOT + "CountyTreeInventory/FeatureServer/1",
}


def get(url, **params):
    response = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "60",
         "--retry", "2", url + "?" + urllib.parse.urlencode(params)],
        check=True, capture_output=True, text=True,
    )
    result = json.loads(response.stdout)
    if "error" in result:
        raise RuntimeError(result["error"])
    return result


def main():
    output = Path(__file__).resolve().parent / "data"
    output.mkdir(exist_ok=True)
    manifest = {"retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sources": {}}
    for name, url in SOURCES.items():
        metadata = get(url, f="json")
        id_field = metadata["objectIdField"]
        ids = sorted(get(url + "/query", where="1=1", returnIdsOnly="true", f="json")["objectIds"])
        features = []
        batch_size = min(1000, metadata.get("maxRecordCount", 1000))
        for start in range(0, len(ids), batch_size):
            batch = ids[start:start + batch_size]
            page = get(url + "/query", objectIds=",".join(map(str, batch)),
                       outFields="*", returnGeometry="true", outSR=4326, f="geojson")
            if page.get("exceededTransferLimit") or len(page.get("features", [])) != len(batch):
                raise RuntimeError(f"Incomplete batch: {name} at {start}")
            features.extend(page["features"])
        actual_ids = [f["properties"][id_field] for f in features]
        if len(set(actual_ids)) != len(ids) or set(actual_ids) != set(ids):
            raise RuntimeError(f"ID verification failed: {name}")
        for feature in features:
            geometry = feature.get("geometry")
            if geometry and geometry.get("crs") is None:
                geometry.pop("crs", None)
        collection = {"type": "FeatureCollection", "features": features}
        (output / (name + ".geojson")).write_text(json.dumps(collection, separators=(",", ":")))
        (output / (name + "-metadata.json")).write_text(json.dumps(metadata, indent=2))
        manifest["sources"][name] = {"url": url, "count": len(features), "object_id_field": id_field}
        print(f"{name}: {len(features):,} features, all object IDs verified", flush=True)
    (output / "sources.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
