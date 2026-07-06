# IT Asset Dashboard

Fully local, browser-based dashboard for Kharkhoda IT asset analysis.

## Run locally

Open `index.html` in a browser. No Node.js, npm, IDE, local server, backend, external API, CDN, telemetry, or cloud database is required.

The app imports `.xlsx`, `.xls`, and `.csv` files manually selected by the user. Asset data remains in the browser on the local device.

For deployment, keep these files together in the same folder:

- `index.html`
- `styles.css`
- `app.js`
- `app.worker.js`
- `excel-processor.js`
- `vendor/xlsx.full.min.js`

## Project structure

- `index.html` - static application shell.
- `styles.css` - responsive enterprise dashboard styling.
- `app.js` - UI state, import flow, navigation, and asset search handling.
- `app.worker.js` - local Web Worker for workbook parsing and indexed search.
- `excel-processor.js` - shared Excel/CSV detection, validation, normalization, filtering, and index-building logic.
- `vendor/xlsx.full.min.js` - local SheetJS browser bundle used to parse Excel and CSV files offline.

## Data processing

The file is parsed once with the local SheetJS bundle. The processor scans headers to find the asset data and accepts either display names or Dataverse CSV logical names:

- `Category Name` or `cr9a7_categoryname`
- `Asset Code` or `cr9a7_assetcode`
- `Asset Store` or `cr9a7_assetstore`
- `Asset Usage` or `cr9a7_assetusage`

The accepted source schema is normalized internally into one common model before dashboard calculations run.

Only records with `Asset Store` exactly equal to `Kharkhoda Store` or `Kharkhoda New Asset Store` are included. Both values are treated as one logical Kharkhoda dataset.

During import, the processor builds in-memory indexes:

- Category map for total category records and `In Stock(STK)` counts.
- Per-category usage maps for drill-down counts.
- Asset Code lookup map for exact-code search.

The UI uses those maps instead of repeatedly scanning workbook rows.
