# lnav timeseries explorer

A single-file, no-build web UI that talks to **lnav 0.14.0**'s external-access HTTP API
to search log lines, extract numeric fields, and plot them as timeseries.

## Files

| File | Purpose |
|---|---|
| `lnav-timeseries.html` | The UI — open this in a browser |
| `serve.js` | Tiny Node proxy that solves the CORS problem (see below) |

## Starting

```
node serve.js <lnav-port>
```

Then open the URL it prints (default `http://localhost:8089`).

In lnav, enable the external-access API first:

```
:external-access 8088 mykey
```

## The flow

### Header — Connection

Enter the base URL and API key, then click **Connect**. The status pill turns green on success.

- **Base URL** — leave blank when using `serve.js` (same-origin proxy, no CORS); or enter
  `http://localhost:PORT` if you have another way to handle CORS.
- **API key** — defaults to `mykey`. Must match the key passed to `:external-access`.

### Section 1 — Query

A direct lnav script editor. Edit the SQL and click **Run query**. Default:

```
;SELECT log_time, log_hostname, log_procname, log_body
  FROM syslog_log
  WHERE log_body LIKE '%live_trader%VIX%'
  ORDER BY log_time
  LIMIT 2000
:write-json-to -
```

The script is posted verbatim to `POST /api/exec` (`Content-Type: text/x-lnav-script`).
Results come back as a JSON array via `:write-json-to -`. The parser also accepts NDJSON
and `{"rows":[...]}` shapes. If parsing fails, expand **raw response from lnav** to see
exactly what came back.

### Section 2 — Extract fields

Shows the result rows in a scrollable table. Optionally extract numeric values from any
text column (e.g. `log_body`) using a regex with named capture groups:

```
VIX: (?<vix>\d+\.\d+), \/VXN26: (?<vx>\d+\.\d+)
```

`log_body` is pre-selected as the source column. Each named group becomes a new column.
Rows that don't match are skipped for that column (they produce no point on the chart).

### Section 3 — Plot over time

- **X axis** — defaults to the first time-ish column (`log_time`, `date`, `ts`, etc.).
- **Series split** — optionally split one series per distinct value of a column (e.g.
  `log_hostname` gives one line per host).
- **Y values** — click chips to toggle which numeric columns to draw.
- **Zoom** — scroll/pinch to zoom the time axis, drag to pan, double-click or **Reset zoom**
  to fit all data. Tooltips show the timestamp formatted as a human-readable datetime.

## Why `serve.js` is needed

lnav's external-access server binds to `localhost` only and sends no CORS headers. If you
open `lnav-timeseries.html` directly from `file://` or another origin, the browser blocks
the response (even though lnav does execute the request — you'll see its views change).

`serve.js` fixes this by acting as a same-origin proxy: it serves the HTML *and* forwards
`/api/*` requests to lnav server-side, so the browser never makes a cross-origin call.

```
node serve.js <lnav-port>          # lnav on :8088, proxy on :8089
LNAV_PORT=8088 PORT=9000 node serve.js   # custom ports
```

Leave the **Base URL** field blank in the UI when using the proxy.

## How auth works

Every request to `/api/*` carries `X-Api-Key: <base64(api-key)>`. The key is whatever
you passed as the second argument to `:external-access`.

## Sources

- lnav external access docs: https://github.com/tstack/lnav/blob/master/docs/source/extacc.rst
- lnav changelog (`:external-access`, Apps): https://github.com/tstack/lnav/blob/master/NEWS.md
