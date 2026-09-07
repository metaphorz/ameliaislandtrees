# Amelia Island Tree Atlas

[Open the interactive map](https://metaphorz.github.io/ameliaislandtrees/)

A zoomable Leaflet map combining Fernandina Beach and county tree inventories,
Omni tree and woody-plant observations, and AIPCA planting-program locations.
Each source has its own colored clusters and visibility control. The map includes
species/condition/search filters, an images-only filter, attached-image galleries,
street and satellite basemaps, a Plantation boundary, and a south-end shortcut.
Dead and not-found inventory records can be hidden. Counts are records, not unique trees.

The default view shows 14,186 records: 14,034 city inventory entries, 97 Omni
observations, and 55 AIPCA planting locations. An optional county layer adds 21
records, some on the mainland. The public AIPCA invasive-plant layer is empty and
is shown with a zero count. Five RCOAST report graphics are linked in the sidebar;
they are reference images, not georeferenced overlays.

[South-island download notes](data/south-island/README.md) document the additional
sources, count checks, media, and limitations. Original media (about 596 MB) are
downloaded locally and excluded from Git; the map loads images on demand from their
original sources and displays their supplied attribution. Observation and photo
licenses are preserved separately. No blanket license is granted for source media.

Crafted by Paul Fishwick & OpenAI Codex 2026

The site uses plain HTML, CSS, and JavaScript with locally bundled Leaflet and
MarkerCluster libraries. GitHub Pages serves the root of the `main` branch; no
build step or API key is needed. Basemap tiles require internet access.

For a local preview, run `python3 -m http.server 8001 --bind 127.0.0.1` in this
directory, then open http://127.0.0.1:8001/.

## Inventory research

Verified and downloaded September 7, 2026. The public APIs work without a token.
The county's [Tree Inventory Map page](https://www.nassaucountyfl.com/1278/Tree-Inventory-Map)
currently contains only a maintenance notice; its HTML does not contain an embedded map URL.
The services below were discovered separately in the property appraiser's public GIS directory.
Their relationship to the former county page has not been confirmed.

## Downloaded inventories

| Dataset | Records | REST layer | Local snapshot |
| --- | ---: | --- | --- |
| Fernandina Beach, 2023 updates | 14,034 | [COFBTreeInventy2023Updates / 0](https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/COFBTreeInventy2023Updates/FeatureServer/0) | `data/fernandina-trees.geojson` |
| County inventory | 21 | [CountyTreeInventory / 1](https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/CountyTreeInventory/FeatureServer/1) | `data/county-trees.geojson` |

All downloaded records have point geometry. Coordinates were requested in WGS84
longitude/latitude (`outSR=4326`). The downloader checks every returned object ID
against the server's ID list. Metadata and retrieval time are in `data/`.

## Coverage and interpretation

- These are inventory records, not a complete census of all trees on the island.
- City records span approximately longitude -81.46946 to -81.42896 and latitude
  30.59916 to 30.69082. Island-wide coverage, including private property, is not established.
- The county's small dataset includes mainland points west of the island and sparse
  or apparently placeholder attributes. Keep it separate and validate locations before use.
- City layer metadata reports a last edit in March 2023; county metadata reports
  February 2022. These dates do not establish when individual trees were surveyed.
- City condition values include 593 `Dead` records; 32 records have `treefound=NO`.
  Do not represent every point as a currently living tree.
- The city layer's internal name ends in `_backup`. It is a usable public snapshot,
  but its status as the authoritative current inventory is not established.

## Fields for visualization

Use `common` for the original common species name and `sci_name` for its scientific
name. `commonname` is populated on only 8 city records (14,026 are null); determine
how verified updates should override original names before normalizing them.

Useful fields include `tree_no`, `dbh`, `stems`, `height`, `spread`, `condition2`,
`street`, `address`, `property`, `treefound`, and `speciesconfirmed`.
Height often contains ranges such as `45-60`, so it is not a simple numeric field.
Confirm measurement units before adding unit labels. Preserve raw values.

The five most frequent original `common` values are Live Oak (4,519), Laurel Oak
(1,723), Sabal Palm (1,306), Loblolly Pine (789), and Slash Pine (710).
These are record counts, including historical/dead records.

## REST examples

The county inventory uses layer **1**, not layer 0.

```sh
# Count city inventory records.
curl -G 'https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/COFBTreeInventy2023Updates/FeatureServer/0/query' \
  --data-urlencode 'where=1=1' \
  --data 'returnCountOnly=true&f=json'

# Retrieve a small GeoJSON sample in longitude/latitude.
curl -G 'https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/COFBTreeInventy2023Updates/FeatureServer/0/query' \
  --data-urlencode 'where=1=1' \
  --data-urlencode 'outFields=objectid,tree_no,common,sci_name,dbh,height,spread,condition2' \
  --data 'returnGeometry=true&outSR=4326&resultRecordCount=5&f=geojson'
```

The city service has a 2,000-record limit per response. A single unrestricted query
does not download the full inventory. Refresh both complete snapshots with:

```sh
python3 download_inventory.py
```

Requires Python 3, curl, and internet access. The script fetches object IDs first,
then retrieves batches of 1,000, checks completeness, and preserves source attributes.

## Other discovered sources

- [TreeCondition_WFL1 / 0](https://maps.ncpafl.com/ncflpa_arcgis/rest/services/Hosted/TreeCondition_WFL1/FeatureServer/0):
  14,036 records, metadata last edit August 2020. Appears to be an older overlapping
  city inventory; do not append it to the 2023 dataset without deduplication.
- [Amelia Island Tree Inventory_results](https://services.arcgis.com/LBbVDC0hKPAnLRpO/arcgis/rest/services/survey123_196cc41a743b464c8e62a42ab38ccdd1_results/FeatureServer/0):
  a public Survey123 results layer, with only one record at verification time.
- [AmeliaIslandTreesClassification_MIL1](https://maps.ncpafl.com/ncflpa_arcgis/rest/services/AmeliaIslandTreesClassification_MIL1/MapServer):
  vegetation classification raster at layer 2; suitable for an overlay, not individual tree points.
- [AmeliaCanopyHeights_MIL1](https://maps.ncpafl.com/ncflpa_arcgis/rest/services/AmeliaCanopyHeights_MIL1/MapServer):
  canopy height raster at layer 2.
- [treecanopy folder](https://maps.ncpafl.com/ncflpa_arcgis/rest/services/treecanopy):
  CanopyLoss, NDVI_Amelia_Island, NoChange, and SignalDifferences map services.
  Metadata was located; raster exports and temporal definitions have not been verified.

A first visualization can use the city GeoJSON for individual markers and filters,
with optional canopy overlays. Further work is needed to establish a complete,
current inventory for the unincorporated portion of Amelia Island.
