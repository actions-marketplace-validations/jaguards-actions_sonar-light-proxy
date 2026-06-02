#!/usr/bin/env node
'use strict';
/**
 * Lightweight HTTP reverse-proxy for SonarQube / SonarCloud.
 *
 * Reads its configuration from environment variables:
 *   SONAR_HOST_URL        – Target SonarQube URL (required)
 *   PROXY_PORT            – Local port to listen on          (default: 9000)
 *   SONAR_PROXY_HEADERS   – JSON object of headers to inject (default: {})
 *
 * The proxy forwards every HTTP request it receives to SONAR_HOST_URL,
 * adding the headers defined in SONAR_PROXY_HEADERS to each upstream request.
 */
const http  = require('http');
const https = require('https');

// ── Configuration ────────────────────────────────────────────────────────────
const rawTarget = process.env.SONAR_HOST_URL;
if (!rawTarget) {
  console.error('[sonar-proxy] SONAR_HOST_URL is required');
  process.exit(1);
}

const targetUrl    = new URL(rawTarget);
const proxyPort    = parseInt(process.env.PROXY_PORT || '9000', 10);
const extraHeaders = (() => {
  try {
    return JSON.parse(process.env.SONAR_PROXY_HEADERS || '{}');
  } catch (err) {
    console.error('[sonar-proxy] Invalid SONAR_PROXY_HEADERS JSON:', err.message);
    process.exit(1);
  }
})();

const isTargetHttps   = targetUrl.protocol === 'https:';
const targetTransport = isTargetHttps ? https : http;
const targetPort = targetUrl.port
  ? parseInt(targetUrl.port, 10)
  : (isTargetHttps ? 443 : 80);

// ── Proxy server ─────────────────────────────────────────────────────────────
const server = http.createServer((clientReq, clientRes) => {
  const upstreamOptions = {
    hostname: targetUrl.hostname,
    port:     targetPort,
    path:     clientReq.url,
    method:   clientReq.method,
    headers: {
      // Forward original headers, then override / extend with extras
      ...clientReq.headers,
      ...extraHeaders,
      // Ensure the Host header matches the upstream server
      host: targetUrl.host,
    },
    // Allow self-signed certificates in CI environments
    rejectUnauthorized: false,
  };

  const upstreamReq = targetTransport.request(upstreamOptions, (upstreamRes) => {
    clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(clientRes, { end: true });
  });

  upstreamReq.on('error', (err) => {
    console.error('[sonar-proxy] Upstream request error:', err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    clientRes.end('Bad Gateway – upstream error: ' + err.message);
  });

  clientReq.pipe(upstreamReq, { end: true });
});

server.on('error', (err) => {
  console.error('[sonar-proxy] Server error:', err.message);
  process.exit(1);
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(proxyPort, '127.0.0.1', () => {
  console.log(`[sonar-proxy] Listening on http://127.0.0.1:${proxyPort}`);
  console.log(`[sonar-proxy] Forwarding to  ${targetUrl.href}`);
  console.log(`[sonar-proxy] Injected headers: ${JSON.stringify(extraHeaders)}`);
});

