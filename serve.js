#!/usr/bin/env node
/*
 * Tiny zero-dependency proxy so the browser talks to ONE origin.
 *
 *   - Serves lnav-timeseries.html at  /
 *   - Forwards  /api/*  to your lnav external-access port
 *
 * Because the page and the API are now the same origin, there is no
 * cross-origin request and therefore no CORS problem. (lnav itself sends
 * no CORS headers, which is why hitting it directly from file:// fails
 * even though lnav receives and runs the request.)
 *
 * Usage:
 *   node serve.js <lnav-port>            # e.g. the port from :external-access
 *   LNAV_PORT=8088 PORT=8089 node serve.js
 *
 * Then open  http://localhost:8089  and LEAVE THE BASE URL BLANK in the UI
 * (blank = same origin = this proxy).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const LNAV_HOST = process.env.LNAV_HOST || '127.0.0.1';
const LNAV_PORT = process.argv[2] || process.env.LNAV_PORT || '8088';
const LISTEN    = process.env.PORT || 8089;
const HTML      = path.join(__dirname, 'lnav-timeseries.html');

const server = http.createServer((req, res) => {
  // Permissive CORS too, in case you open the page from elsewhere.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.url.startsWith('/api/')) {
    const proxyReq = http.request({
      host: LNAV_HOST, port: LNAV_PORT, path: req.url, method: req.method,
      headers: { ...req.headers, host: `${LNAV_HOST}:${LNAV_PORT}` },
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', e => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('proxy could not reach lnav at ' + LNAV_HOST + ':' + LNAV_PORT + ' — ' + e.message);
    });
    req.pipe(proxyReq);
    return;
  }

  fs.readFile(HTML, (err, buf) => {
    if (err) { res.writeHead(500); return res.end(String(err)); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(buf);
  });
});

server.listen(LISTEN, () => {
  console.log(`lnav-app proxy listening on http://localhost:${LISTEN}`);
  console.log(`  forwarding /api/* → http://${LNAV_HOST}:${LNAV_PORT}`);
  console.log(`  open the URL above and leave the "base URL" field blank.`);
});
