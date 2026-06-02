#!/usr/bin/env node
'use strict';
/**
 * main.js – GitHub Action entry point.
 *
 * Spawns proxy.js as a detached background process, waits until it accepts
 * connections, then exports the proxy URL as an output.
 * The child PID is persisted via @actions/core saveState so that post.js can
 * stop the proxy at the end of the job.
 */

const core        = require('@actions/core');
const { spawn }   = require('child_process');
const path        = require('path');
const net         = require('net');

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

async function run() {
  const sonarHostUrl = core.getInput('sonar-host-url', { required: true });
  const proxyPort    = core.getInput('proxy-port') || '9000';
  const headers      = core.getInput('headers')    || '{}';

  const proxyScript = path.join(__dirname, 'proxy.js');

  core.info(`[sonar-proxy] Starting proxy on port ${proxyPort} → ${sonarHostUrl}`);

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
  core.saveState('SONAR_PROXY_PID', String(child.pid));
  core.info(`[sonar-proxy] Spawned (PID=${child.pid}), waiting for port ${proxyPort}…`);

  await waitForPort(parseInt(proxyPort, 10));

  const proxyUrl = `http://127.0.0.1:${proxyPort}`;
  core.info(`[sonar-proxy] Ready on ${proxyUrl}`);
  core.setOutput('proxy-url', proxyUrl);
}

run().catch((err) => {
  core.setFailed(`[sonar-proxy] ${err.message}`);
});

