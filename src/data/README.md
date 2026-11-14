# Local map boundaries

`florida-counties.json` contains only public Florida county boundaries. It is
derived from the unprojected `counties-10m.json` in `us-atlas` 3.0.1, selecting
county FIPS codes beginning with `12` and converting TopoJSON to GeoJSON with
`topojson-client` 3.1.0. The underlying data is the US Census Bureau's 2017
cartographic boundary shapefiles, simplified by us-atlas.

Sources: https://github.com/topojson/us-atlas and
https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html

No customer locations or other CRM data are stored in this asset. The default
overview renders locally. OpenStreetMap tiles load only after explicit opt-in
through the map's street-map control.

## us-atlas license

Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
