# Additional city tree records

Downloaded September 7, 2026. `sources.json` records the live layer URLs, counts,
and retrieval time. GeoJSON uses WGS84 longitude/latitude. The downloader verifies
the complete object-ID set and attachment counts for each source.

| Layer | Records | Purpose |
| --- | ---: | --- |
| HeritageTrees | 84 | Designated heritage trees, resolution IDs, document and photo-sheet links |
| PlantedTrees | 743 | City planting dates, species, measurements, and photo links |
| HeritageTreeNominationEvaluation | 24 | Historical nomination recommendations, condition, and assessment notes |

Files retain the original attributes. The planting layer also exposes one image
attachment, indexed separately. Other media appear in original photo-link fields;
PDF photo sheets are linked as documents in the website. Links are kept as
published; they may contain source errors and are not evidence for transferring
a name or designation to a different tree. No tree identity is inferred from a
photo filename. Raw inspection numbers in the assessment layer are not converted
to dates because their encoding has not been verified.

## Overlap check

`overlap-audit.json` compares public point locations against the city inventory,
using a 5-meter approximate local-distance threshold. There are nearby city
records for 31 heritage records, 82 planting records, and 12 assessments.
The map provides links to these candidates, explicitly labeled as unverified.

Proximity is not proof of identity. Different trees can be close together, and the
same tree can have different coordinates across surveys. Missing candidates do
not establish that a record is a new tree. Numeric object IDs and tree IDs from
different layers are not treated as a shared identifier. Records are not merged,
and displayed totals count source records, not unique trees.

## Names and additional details

Names are extracted only from explicit tree-name-like source location labels
(such as `Kate's Tree`, `Julie's Tree`, or a parenthetical `Kates Tree`). Other
location notes remain visible and searchable without being promoted to a name.
Source spellings are retained. Generic source attributes are available under
“More recorded details”; blank values and editor-tracking internals are omitted.

Refresh with `python3 download_city_supplements.py`; this also rebuilds the overlap
audit against the current local city inventory. Verify with
`node --test test-map-data.cjs`.
