# Amelia Island Tree Atlas

[Open the interactive map](https://metaphorz.github.io/ameliaislandtrees/)

A zoomable Leaflet map combining Fernandina Beach and county tree inventories,
Omni tree and woody-plant observations, and AIPCA planting-program locations.
Each source has its own colored clusters and visibility control. The map includes
species/condition/search filters, an images-only filter, attached-image galleries,
street and satellite basemaps, a Plantation boundary, and a south-end shortcut.
Dead and not-found inventory records can be hidden. Counts are records, not unique trees.

The default view shows 15,013 records: 14,034 city inventory entries, 97 Omni
observations, 55 AIPCA planting locations, 84 designated heritage records, and 743
city planting records. Optional layers add 21 county records (some on the mainland)
and 24 historical heritage-nomination assessments. The public AIPCA invasive-plant layer is empty and
is shown with a zero count. Five RCOAST report graphics are linked in the sidebar;
they are reference images, not georeferenced overlays.

Recorded names such as Kate's Tree and Julie's Tree appear as popup titles and
are searchable, along with addresses, tree numbers, and recorded notes. Every
tree popup includes public latitude/longitude in decimal degrees, with an
approximation note for obscured observations. Popups expose additional recorded
details, designation documents, and source record links; PDF photo sheets open as
documents rather than being treated as images.

[City supplement notes](data/city-supplements/README.md) cover the new layers and
overlap audit. Nearby points are candidates for review, not confirmed duplicate
trees. Source records and their potentially conflicting values remain separate.
Refresh these snapshots with `python3 download_city_supplements.py`.
Run data-adapter regression tests with `node --test test-map-data.cjs`.

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

### Fort Clinch maritime forest

The default-on habitat overlay uses Florida DEP / Division of Recreation and Parks
Natural Communities GIS polygons filtered to `SITE_NAME = 'Fort Clinch State Park'`
and current community code `MAH` (maritime hammock). The September 7, 2026 snapshot
contains 54 features totaling 803.89 source-recorded acres. This differs from the
older timber assessment (58 polygons / 787 acres); the app uses the GIS snapshot.
These are habitat boundaries, not individual trees or remotely measured canopy
cover. They are excluded from tree counts, search, species, and condition filters.
The layer includes park-managed areas west of Amelia Island, not just the canopy drive.
Use **Explore Fort Clinch** to turn on and zoom to the overlay.

Source: https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/5

Run `python3 download_fort_clinch.py` to refresh the GeoJSON, source metadata, and
provenance manifest in `data/fort-clinch/`. The downloader verifies every returned
object ID against the service's matching ID list and preserves full polygon
geometry in WGS84. Retrieval date is not a survey date. The source describes
mapping by park and regional biologists with field verification; no individual
polygon survey dates are supplied.

### Statistics panel

Open **Statistics** above the layer controls. Choose current map view (default) or
all filtered records. Counts, source totals, species bars/tables, conditions, and
source-specific diameter summaries follow the existing filters. Habitat polygons
are excluded. Species labels are preserved as recorded rather than taxonomically
merged. Counts include overlapping inventory records and repeated observations.

Diameter statistics accept only positive single values explicitly labeled in
inches (including a single inch mark); bare numbers, malformed quotes, ranges,
inequalities, multiple stems, and other units are excluded with reason counts.
The current snapshot yields 50/84 heritage and 677/743 city-planting measurements;
main inventory units remain unverified. Sources are never pooled for diameter
statistics. Mean, median, all tied modes, population standard deviation, and
population variance are computed without intermediate rounding. Mode is reported
as absent if no value repeats. Empty selections do not produce numerical results.
Height/spread statistics remain deferred pending compatible values and verified units.

Validation: `node --test test-map-data.cjs test-statistics.cjs` and
`node --check map.js`. Statistics calculations live in `statistics.js` and run only
when the panel is open; map movement updates the current-view summary.


Circumference summaries preserve the heritage layer's explicit inch-labeled
`cir_` values separately from estimated circumference (`π × diameter`, assuming
a circular trunk). The source does not establish whether recorded circumference
was measured directly or calculated. Both summaries show mean, median, modes,
population standard deviation/variance, usable sample sizes, and exclusions.

Record density always uses **the current map view**, even when the other
statistics summarize all filtered records. Its denominator is the spherical
surface area of the latitude/longitude rectangle (mean Earth radius 6,371,008.8 m;
4,046.8564224 square meters per acre), including water and unsurveyed areas.
The numerator is filtered point records inside that rectangle; total and
per-source rates are displayed. Filters change the numerator without changing
the area; panning/zooming changes the rectangle. This is inventory-record density,
not ecological tree density. It includes duplicates and observations, and a zero
rate means no matching records. Habitat polygon acreage is not used as a proxy
for surveyed tree area.
