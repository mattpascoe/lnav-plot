# lnav timeseries explorer

A web UI that talks to **lnav 0.14.0+**'s external-access HTTP API
to search log lines, extract numeric fields, and plot them as timeseries.

## Install

- Clone the repo into your lnav configs directory. Here is a XDG example:
```
git clone https://github.com/mpascoe/lnav-app.git -C ~/.config/lnav/configs
```

## Start

- In lnav, enable the external-access API and log in once to set the session cookie:
```
:external-access 8088 mykey
:external-access-login ona/lnav-plot
```

- Click the globe icon that appears in the top right of the LNAV UI, then select **lnav-plot**.
- The app connects automatically — no credentials to enter.

## The flow

### Header

The app auto-connects on load using the session cookie set by `:external-access-login`.
The status pill turns green on success and the header controls become active.

**File dropdown** — lists every file currently open in lnav (filename, line count, format).
Select a file to restrict all queries to that file. Leave at "— all files —" to query across all loaded files.

**Time range picker** — a Splunk-style dropdown with quick presets and a custom range option:

| Preset | Behaviour |
|---|---|
| Last 15 min / 1 h / 4 h / 24 h / 7 d | Rolling window ending now |
| All time | No time filter (default) |
| Custom range… | Reveals from/to datetime inputs; click **Apply** to set |

### Section 1 — Query

The script box is the **single source of truth** — its exact contents are posted to
`POST /api/exec` (`Content-Type: text/x-lnav-script`) when you click **Run query**.

The header inputs **write into the script box for you**: the **file dropdown** sets the `FROM`
table (from the file's format) and a `log_path = '...'` condition, and the **time range** sets
`log_time >= / <=` — so the box always shows exactly what will run. To query a different table,
just edit the `FROM` line in the script box yourself. Manual edits are kept and sent as-is. Default:

```
;SELECT log_time, log_hostname, log_procname, log_body
  FROM syslog_log
  WHERE log_body LIKE '%live_%VIX%'
  ORDER BY log_time
  LIMIT 2000
:write-json-to -
```

**Post-query field extraction** (also in Section 1) pulls numeric values out of a text column
(e.g. `log_body`) using a regex with named capture groups — this runs **client-side on the returned
rows** and does not change the script:

```
VIX: (?<vix>\d+\.\d+), \/VXN26: (?<vx>\d+\.\d+)
```

`log_body` is pre-selected as the source column. Each named group becomes a new column.
Rows that don't match are skipped for that column (they produce no point on the chart).

### Section 2 — Results

Shows the result rows in a scrollable table, a row/column summary, and an expandable
**raw response from lnav** panel. Results come back as a JSON array via `:write-json-to -`;
the parser also accepts NDJSON and `{"rows":[...]}` shapes. If parsing fails, expand the raw
panel to see exactly what came back.

### Section 3 — Plot over time

- **X axis** — defaults to the first time-ish column (`log_time`, `date`, `ts`, etc.).
- **Series split** — optionally split one series per distinct value of a column (e.g.
  `log_hostname` gives one line per host).
- **Y values** — click chips to toggle which numeric columns to draw.
- **Zoom** — scroll/pinch to zoom the time axis, drag to pan, double-click or **Reset zoom**
  to fit all data. Tooltips show the timestamp formatted as a human-readable datetime.

## How auth works

Authentication uses the `lnav_session_id` cookie set when you run `:external-access-login`
in lnav. The browser sends the cookie automatically — no API key is needed. Sessions are
valid for the lifetime of the lnav process; run `:external-access-login` again after
restarting lnav.

## Sources

- lnav external access docs: https://github.com/tstack/lnav/blob/master/docs/source/extacc.rst
- lnav changelog (`:external-access`, Apps): https://github.com/tstack/lnav/blob/master/NEWS.md
