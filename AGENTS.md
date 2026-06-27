# AGENTS.md — lnav timeseries explorer

Context and conventions for AI agents working on this project.

## What this project is

A zero-dependency, single-file browser UI (`app-files/index.html`) for querying a running
lnav instance via its HTTP API, extracting numeric fields from log lines, and plotting them
as timeseries. There is no build step, no package.json, no framework. Everything lives in
one HTML file with inline CSS and inline JS.

## Files

```
app-files/index.html   The entire UI — HTML + CSS + JS in one file
README.md              User-facing docs
AGENTS.md              This file
```

## How to run

```
# In lnav, enable external access and log in once to set the session cookie:
:external-access 8088 mykey
:external-access-login ona/lnav-plot

# Click globe icon in top right of LNAV UI then select "lnav-plot" app from the list.
# The app auto-connects and populates the file list — no credentials to enter.
```

## Architecture

### lnav HTTP API (v0.14.0+)

- `GET  /api/version` — returns a version string; used as a connection test.
- `POST /api/exec`    — body is an lnav script (`Content-Type: text/x-lnav-script`);
  returns the script's stdout output as plain text.
- Auth: handled automatically via the `lnav_session_id` cookie set by `:external-access-login`.
  No `X-Api-Key` header is sent.

### Structured inputs — the textbox is the source of truth

The `<textarea id="script">` in Section 1 is the single source of truth: `runQuery()` sends its
contents **verbatim** to `/api/exec`. There is no run-time injection step. Instead, the structured
inputs **live-edit the textbox** via `syncScript()` whenever they change:

| Control | What it manages in the textbox |
|---|---|
| File dropdown (`#fileSelect`, header) | Populated on connect by `SELECT * FROM lnav_file` (columns: `filepath`, `format`, `lines`). On change, replaces `FROM <table>` with the file's `format` and upserts a `log_path = '...'` condition. "— all files —" removes the `log_path` condition (FROM is left as-is). |
| Time range picker (`#timeBtn` / `#timePanel`, header) | Splunk-style dropdown. Presets/custom set `start`/`end` as JS `Date`s in `state.timeRange`, then upsert `log_time >= '...'` / `log_time <= '...'`. "All time" removes both. |

The FROM table is driven solely by the file picker's `format`; to query a different table, edit the
script box directly.

### Live sync (`syncScript` / `upsertCondition`)

`syncScript()` rewrites only the fragments it manages, preserving SELECT columns, LIMIT, the base
`log_body LIKE '%'` condition, and any manual edits. `upsertCondition(script, sigRegex, newText|null)`
is idempotent:
- `newText` set + signature present → replace the matched condition's value (no stacking).
- `newText` set + absent → insert `WHERE <cond> AND ` after `WHERE`, else `WHERE <cond>` before the
  first `ORDER BY`/`LIMIT`.
- `newText` null → remove `<cond> AND `, else ` AND <cond>`, else the lone `WHERE <cond>`.

Sync is **one-way** (inputs → textbox). Manual edits to the textbox are preserved and sent as-is, but
do not push back into the widgets. The regex field extractor (Section 1) is **client-side post-processing**
on returned rows and does **not** touch the textbox.

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

### JS state model

```js
state = {
  rows: [],                        // raw array of objects from the last successful query
  cols: [],                        // ordered column names (may grow after regex extraction)
  numericCols: [],                 // subset of cols where every non-null value passes isNum()
  yCols: Set,                      // which numericCols are toggled on for the chart
  chart: null,                     // Chart.js instance; destroyed and recreated on each render
  timeRange: { start: null, end: null }, // active time filter (JS Date objects or null)
  timePreset: 'all',               // key of the active preset button
}
```

Key functions:

| Function | What it does |
|---|---|
| `exec(script)` | POSTs to `/api/exec` (relative URL, same origin), returns response text |
| `syncScript()` | Rewrites the textbox in place from the structured inputs (file picker → FROM + log_path, time range) |
| `upsertCondition(script, sig, text\|null)` | Idempotent add/update/remove of one WHERE condition |
| `loadFileList()` | Queries `lnav_file`, populates `#fileSelect`; called once after connect |
| `applyPreset(key)` | Updates `state.timeRange` + `state.timePreset`, refreshes the time button label, calls `syncScript()` |
| `fmtDt(date)` | Formats a JS Date as `YYYY-MM-DD HH:MM:SS` for lnav SQL |
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
| Re-enable API key auth | Add `X-Api-Key: btoa(key)` header inside `exec()` |
| Add a time preset | Add an entry to the `PRESETS` array and a matching `<button class="preset-btn">` in HTML |
| Add a new structured filter | Add the input, then an `upsertCondition()` call in `syncScript()`, and wire the input's change event to `syncScript()` |
| Add a new chart type | `renderChart()` — change `type:` and dataset shape |
| Add a new lnav API call | Add a helper alongside `exec()` |
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
