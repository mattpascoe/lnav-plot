# AGENTS.md — lnav timeseries explorer

Context and conventions for AI agents working on this project.

## What this project is

A zero-dependency, single-file browser UI (`lnav-timeseries.html`) for querying a running
lnav instance via its HTTP API, extracting numeric fields from log lines, and plotting them
as timeseries. There is no build step, no package.json, no framework. Everything lives in
one HTML file with inline CSS and inline JS. `serve.js` is a thin Node.js proxy (also
no dependencies) that exists solely to work around a CORS limitation in lnav's HTTP server.

## Files

```
lnav-timeseries.html   The entire UI — HTML + CSS + JS in one file
serve.js               Node proxy: serves the HTML and forwards /api/* to lnav
README.md              User-facing docs
AGENTS.md              This file
```

## How to run

```
# In lnav:
:external-access 8088 mykey

# In a terminal:
node serve.js 8088        # proxy listens on :8089 by default
# Open http://localhost:8089 in a browser
# Leave the "base URL" field blank; API key defaults to "mykey"
```

## Architecture

### lnav HTTP API (v0.14.0+)

- `GET  /api/version` — returns a version string; used as a connection test.
- `POST /api/exec`    — body is an lnav script (`Content-Type: text/x-lnav-script`);
  returns the script's stdout output as plain text.
- Auth: every request must carry `X-Api-Key: <base64(api-key)>`.
- The server binds to `localhost` only and sends **no CORS headers**, which is why
  `serve.js` is required when the page is not served from lnav's own origin.

### Query format

Scripts posted to `/api/exec` follow lnav's script syntax — a semicolon-prefixed SQL
statement followed by an output command on its own line:

```
;SELECT log_time, log_hostname, log_procname, log_body
  FROM syslog_log
  WHERE log_body LIKE '%live_trader%VIX%'
  ORDER BY log_time
  LIMIT 2000
:write-json-to -
```

`:write-json-to -` streams the SQL result as a JSON array to stdout, which becomes the
HTTP response body. The JS parser (`parseRows`) also accepts NDJSON and `{"rows":[...]}`.

### serve.js proxy

- Serves `lnav-timeseries.html` at `/`.
- Forwards any request to `/api/*` to `http://127.0.0.1:<lnav-port>` unchanged (headers
  included), then pipes the response back. This makes the browser think it is talking to
  one origin, avoiding the CORS block.
- Adds permissive CORS headers on its own responses so the page can also be opened from
  other origins if needed.
- Zero dependencies — plain `http` module only.

### JS state model (inside lnav-timeseries.html)

```js
state = {
  rows: [],         // raw array of objects from the last successful query
  cols: [],         // ordered column names (may grow after regex extraction)
  numericCols: [],  // subset of cols where every non-null value passes isNum()
  yCols: Set,       // which numericCols are toggled on for the chart
  chart: null,      // Chart.js instance; destroyed and recreated on each render
}
```

Key functions:

| Function | What it does |
|---|---|
| `exec(script)` | POSTs to `/api/exec`, returns response text |
| `parseRows(text)` | Parses JSON / NDJSON into `rows[]` |
| `loadRows(rows)` | Sets state, calls detect/render/populate cascade |
| `detectNumeric()` | Samples up to 20 non-null values per column; marks column numeric if all pass `isNum()`. Excludes `undefined` (rows where a regex didn't match). |
| `renderTable()` | Builds the results `<table>`; caps display at 200 rows |
| `populateExtractCol()` | Populates the regex source-column `<select>`; defaults to `log_body` |
| `populateChartControls()` | Rebuilds X/series dropdowns and Y chip toggles |
| `renderChart()` | Destroys and recreates the Chart.js instance |
| `resetZoom()` | Calls `chart.resetZoom()` from chartjs-plugin-zoom |

### Numeric detection edge case

Columns added by regex extraction are only present on rows where the regex matched.
Unmatched rows have `undefined` for those keys. `detectNumeric` filters out
`null | '' | undefined` before sampling, so a column is still classified as numeric even
when only a subset of rows matched.

### Chart details

- Library: **Chart.js 4.4.3** + **chartjs-plugin-zoom 2.0.1**, both from jsDelivr CDN.
- X axis: `type: 'linear'` storing Unix epoch milliseconds. `toX()` converts ISO/datetime
  strings via `Date.parse()`; falls back to `Number()` for numeric timestamps.
- Tick callback and tooltip title both format the epoch as a human-readable locale string.
- Zoom is x-axis only; minimum range is 1000 ms. Pan has no modifier key requirement.
- Toggling a Y chip or changing X/series dropdowns calls `renderChart()` directly —
  there is no debounce. Zoom state resets on every re-render (chart is destroyed/recreated).
- Color palette: 8-color array `PALETTE`, cycling by dataset index.

## Conventions and constraints

- **No build step, ever.** Keep everything in the two existing files. Do not introduce
  npm, bundlers, TypeScript, or additional runtime files unless the user explicitly asks.
- **No external dependencies beyond the two CDN scripts.** If offline support is needed,
  the user can download the CDN files locally and update the `<script src>` paths.
- **All state lives in `state`.** Do not add module-level variables outside `state` for
  things that need to survive across re-renders.
- **Styling uses CSS custom properties** defined in `:root`. Use those variables for any
  new UI elements; do not hardcode colors.
- **No comments explaining what code does** — only add a comment when the WHY is
  non-obvious (a workaround, a subtle invariant, a known lnav quirk).
- **`renderChart()` always destroys then recreates.** Do not try to update datasets
  in-place on an existing Chart.js instance.
- **The `esc()` helper must be used** for any user-derived or server-derived string
  inserted into `innerHTML` to prevent XSS.

## Common tasks and where to touch

| Task | Where |
|---|---|
| Change default SQL query | `<textarea id="script">` in the HTML |
| Change default API key | `value="mykey"` on `<input id="apiKey">` |
| Add a new chart type | `renderChart()` — change `type:` and dataset shape |
| Add a new lnav API call | Add a helper alongside `exec()` |
| Change proxy listen port | `LISTEN` constant in `serve.js` or `PORT` env var |
| Change lnav target host/port | `LNAV_HOST` / `LNAV_PORT` in `serve.js` or env vars |
| Add a new UI section | Add a `.card` section in HTML; show/hide from `loadRows()` |
| Persist settings across page loads | Use `localStorage` — there is currently none |

## Known limitations / things not to break

- `detectNumeric` samples only the **first 20 non-null rows** per column. A column where
  the first 20 matches are numeric but later rows are not will be misclassified. This is
  intentional (performance) — do not increase without considering large result sets.
- The table renders at most **200 rows** for performance; all rows are still available in
  `state.rows` for charting.
- `Date.parse()` behaviour is locale/browser-dependent for non-ISO strings. lnav's
  `log_time` column returns ISO-like strings (`2026-06-22 09:14:32`) which parse reliably
  in all modern browsers.
- The zoom plugin keeps no state between `renderChart()` calls — every toggle or dropdown
  change resets the zoom to fit-all. If zoom persistence is added, the chart must be
  updated in-place rather than destroyed.
