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

// ── Port availability helpers ─────────────────────────────────────────────────

/** Returns true if the given port is free (nothing listening on it). */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(() => resolve(true)); });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Returns an available port. Tries `desiredPort` first; if it is taken,
 * asks the OS for a random free port by binding on port 0.
 */
async function findAvailablePort(desiredPort) {
  if (await isPortFree(desiredPort)) return desiredPort;
  info(`[sonar-proxy] Port ${desiredPort} is already in use, picking a random free port…`);
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.once('listening', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.listen(0, '127.0.0.1');
  });
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
  const sonarHostUrl    = getInput('sonar-host-url', { required: true });
  const desiredPort     = parseInt(getInput('proxy-port') || '9000', 10);
  const headers         = getInput('headers') || '{}';

  const proxyScript = path.join(__dirname, 'proxy.js');

  // Pick the desired port or a random free one if it is already occupied
  const actualPort = await findAvailablePort(desiredPort);
  if (actualPort !== desiredPort) {
    info(`[sonar-proxy] Using port ${actualPort} instead of ${desiredPort}`);
  }

  info(`[sonar-proxy] Starting proxy on port ${actualPort} → ${sonarHostUrl}`);

  const child = spawn(process.execPath, [proxyScript], {
    detached: true,
    stdio:    'inherit',
    env: {
      ...process.env,
      SONAR_HOST_URL:      sonarHostUrl,
      PROXY_PORT:          String(actualPort),
      SONAR_PROXY_HEADERS: headers,
    },
  });

  child.unref();

  // Persist the PID so the post step can stop the process
  saveState('SONAR_PROXY_PID', String(child.pid));
  info(`[sonar-proxy] Spawned (PID=${child.pid}), waiting for port ${actualPort}…`);

  await waitForPort(actualPort);

  const proxyUrl = `http://127.0.0.1:${actualPort}`;
  info(`[sonar-proxy] Ready on ${proxyUrl}`);
  setOutput('proxy-url', proxyUrl);
}

run().catch((err) => {
  setFailed(`[sonar-proxy] ${err.message}`);
});
