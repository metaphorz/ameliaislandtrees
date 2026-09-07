# South-island source archive

Downloaded September 7, 2026 with `python3 download_south_island.py`.
See `sources.json` for exact source URLs and retrieval time. Every ArcGIS feature
ID and the iNaturalist total count were verified. All 228 media downloads succeeded;
byte sizes and SHA-256 hashes are recorded in `media-manifest.json`.

| Source | Records | Downloaded media | Meaning |
| --- | ---: | ---: | --- |
| AIPCA planting locations | 55 | 39 image attachments | Planting-program locations; not all confirmed planted |
| AIPCA invasive-plant reports | 0 | 0 | Public layer was empty |
| AIPCA boundary | 1 polygon | 0 | Community extent |
| Omni Amelia Island iNaturalist | 97 | 184 photos | Tree and woody-plant observations; not necessarily unique plants |
| RCOAST 2025 natural-resources inventory | 5 reference graphics | 5 images | Report illustrations, not spatial datasets |

GeoJSON coordinates use WGS84 longitude/latitude. iNaturalist locations retain
the publicly supplied precision/obscuration; no private coordinates were requested.
The iNaturalist raw observation JSON, derived GeoJSON, project definition, photo
metadata, attribution, and per-observation/per-photo license codes are retained.
Some photos have no license code; do not interpret public access as an open reuse license.

AIPCA `planted` values are Yes (14), No (3), Choice 2 (21), and null (17).
The current coded-value domain does not define Choice 2. The map labels only Yes
as reported planted, No as reported not planted, and the rest as unknown. Source
species spellings and date values are preserved. Planting/observation records do
not inherit city tree-condition values.

RCOAST's public case study exposed five downloadable gallery images. Its
“View Additional Report Graphics” link opens that gallery. No public downloads
for the actual LiDAR point cloud, DEM, orthomosaic, or GIS files were linked on
the case-study page. Those files have **not** been downloaded. Their availability
would need to be established with AIPCA/RCOAST. No request has been sent.

Original media occupy about 596 MB and remain in the local archive, excluded from
Git. The website uses the source image URLs lazily in popups, with attribution;
its availability therefore depends on the source services. Paths in the media
manifest refer to local archive files, not guaranteed GitHub Pages assets.

The county's existing inventory is separately available in `../county-trees.geojson`.
It includes mainland locations and is off by default in the map. Source datasets
are kept separate and are not deduplicated into a purported island-wide tree census.
