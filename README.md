# lnav timeseries explorer

A web UI that talks to **lnav 0.14.0+**'s external-access HTTP API
to search log lines, extract numeric fields, and plot them as timeseries.

## Install

- Clone the repo into your lnav configs directory. Here is a XDG example:
```
git clone https://github.com/mpascoe/lnav-app.git -C ~/.config/lnav/configs
```

## Start

- In lnav, enable the external-access API. Provide a port and API key as desired:
```
:external-access 8088 mykey
```

- Click the globe icon that appears in the top right of the LNAV UI.

## The flow

### Header — Connection

Enter the API key, then click **Connect**. The status pill turns green on success.

- **API key** — defaults to `mykey`. Must match the key passed to `:external-access`.

### Section 1 — Query

A direct lnav script editor. Edit the SQL and click **Run query**. Default:

```
;SELECT log_time, log_hostname, log_procname, log_body
  FROM syslog_log
  WHERE log_body LIKE '%live_%VIX%'
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

## How auth works

Every request to `/api/*` carries `X-Api-Key: <base64(api-key)>`. The key is whatever
you passed as the second argument to `:external-access`.

## Sources

- lnav external access docs: https://github.com/tstack/lnav/blob/master/docs/source/extacc.rst
- lnav changelog (`:external-access`, Apps): https://github.com/tstack/lnav/blob/master/NEWS.md
