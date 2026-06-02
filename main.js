#!/usr/bin/env node
'use strict';
/**
 * main.js – GitHub Action entry point.
 *
 * Spawns proxy.js as a detached background process, waits until it accepts
 * connections, then exports the proxy URL as an output.
 * The child PID is persisted via GITHUB_STATE so that post.js can
 * stop the proxy at the end of the job.
 *
 * No external dependencies – uses only Node.js built-ins and native
 * GitHub Actions workflow commands / environment files.
 */

const { spawn } = require('child_process');
const fs        = require('fs');
const net       = require('net');
const path      = require('path');

// ── GitHub Actions helpers (no @actions/core needed) ─────────────────────────

/** Read a step input (set in action.yml `inputs:`). */
function getInput(name, options = {}) {
  const val = (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '').trim();
  if (options.required && !val) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  return val;
}

/** Persist a value so the post-step can read it via STATE_<name>. */
function saveState(name, value) {
  const stateFile = process.env.GITHUB_STATE;
  if (stateFile) {
    fs.appendFileSync(stateFile, `${name}=${value}\n`);
  } else {
    // Fallback for older runners
    process.stdout.write(`::save-state name=${name}::${value}\n`);
  }
}

/** Publish a step output (readable by subsequent steps). */
function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  } else {
    // Fallback for older runners
    process.stdout.write(`::set-output name=${name}::${value}\n`);
  }
}

function info(msg)   { console.log(msg); }
function setFailed(msg) {
  process.stderr.write(`::error::${msg}\n`);
  process.exit(1);
}

// ── Port-readiness check ──────────────────────────────────────────────────────

async function waitForPort(port, timeoutSeconds = 15) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Proxy did not start within ${timeoutSeconds} seconds on port ${port}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const sonarHostUrl = getInput('sonar-host-url', { required: true });
  const proxyPort    = getInput('proxy-port') || '9000';
  const headers      = getInput('headers')    || '{}';

  const proxyScript = path.join(__dirname, 'proxy.js');

  info(`[sonar-proxy] Starting proxy on port ${proxyPort} → ${sonarHostUrl}`);

  const child = spawn(process.execPath, [proxyScript], {
    detached: true,
    stdio:    'inherit',
    env: {
      ...process.env,
      SONAR_HOST_URL:      sonarHostUrl,
      PROXY_PORT:          proxyPort,
      SONAR_PROXY_HEADERS: headers,
    },
  });

  child.unref();

  // Persist the PID so the post step can stop the process
  saveState('SONAR_PROXY_PID', String(child.pid));
  info(`[sonar-proxy] Spawned (PID=${child.pid}), waiting for port ${proxyPort}…`);

  await waitForPort(parseInt(proxyPort, 10));

  const proxyUrl = `http://127.0.0.1:${proxyPort}`;
  info(`[sonar-proxy] Ready on ${proxyUrl}`);
  setOutput('proxy-url', proxyUrl);
}

run().catch((err) => {
  setFailed(`[sonar-proxy] ${err.message}`);
});
