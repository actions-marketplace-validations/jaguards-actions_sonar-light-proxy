#!/usr/bin/env node
'use strict';
/**
 * Patches report-task.txt so that the sonarqube-quality-gate-action routes
 * its polling requests through the local proxy instead of the upstream server.
 *
 * What it does:
 *   1. Reads REPORT_TASK_PATH (default: .scannerwork/report-task.txt).
 *   2. Extracts the value of `serverUrl` – this is the "real" upstream URL
 *      that the SonarQube server advertised back to the scanner.
 *   3. Replaces every occurrence of that upstream URL with PROXY_URL inside
 *      the three fields that the quality-gate action cares about:
 *        • serverUrl
 *        • ceTaskUrl
 *        • dashboardUrl
 *   4. Writes the patched content back to the same file.
 *
 * Environment variables (set by action.yml via env:):
 *   PROXY_URL          – Local proxy URL, e.g. http://127.0.0.1:9000  (required)
 *   REPORT_TASK_PATH   – Path to report-task.txt                       (optional)
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
// Inputs are passed as environment variables from action.yml.
const proxyUrl        = process.env.PROXY_URL;
const reportTaskPath  = process.env.REPORT_TASK_PATH
  || path.join(process.cwd(), '.scannerwork', 'report-task.txt');

if (!proxyUrl) {
  console.error('[patch-report-task] Input "proxy-url" is required.');
  process.exit(1);
}

// ── Read ──────────────────────────────────────────────────────────────────────
if (!fs.existsSync(reportTaskPath)) {
  console.error(`[patch-report-task] File not found: ${reportTaskPath}`);
  process.exit(1);
}

const original = fs.readFileSync(reportTaskPath, 'utf8');
console.log(`[patch-report-task] Read ${reportTaskPath}`);

// ── Extract upstream serverUrl ────────────────────────────────────────────────
const serverUrlMatch = original.match(/^serverUrl=(.+)$/m);
if (!serverUrlMatch) {
  console.error('[patch-report-task] Could not find serverUrl in report-task.txt');
  process.exit(1);
}

const upstreamUrl = serverUrlMatch[1].trim();
console.log(`[patch-report-task] Upstream serverUrl : ${upstreamUrl}`);
console.log(`[patch-report-task] Replacing with     : ${proxyUrl}`);

if (upstreamUrl === proxyUrl) {
  console.log('[patch-report-task] URLs already match – nothing to do.');
  process.exit(0);
}

// ── Replace all occurrences of the upstream URL ───────────────────────────────
// Use a global replace so ceTaskUrl and dashboardUrl are also patched.
const escaped = upstreamUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patched  = original.replace(new RegExp(escaped, 'g'), proxyUrl);

// ── Write ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(reportTaskPath, patched, 'utf8');
console.log('[patch-report-task] File patched successfully.');
console.log('--- Patched content ---');
console.log(patched.trim());
console.log('-----------------------');

