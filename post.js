#!/usr/bin/env node
'use strict';
/**
 * post.js – GitHub Action post-step entry point.
 *
 * Reads the proxy PID saved by main.js and sends SIGTERM to stop the process.
 * Runs automatically at the end of the job (even on failure) because
 * action.yml sets post-if: always().
 */

const core = require('@actions/core');

function run() {
  const pid = core.getState('SONAR_PROXY_PID');

  if (!pid) {
    core.info('[sonar-proxy] No proxy PID found in state – nothing to stop.');
    return;
  }

  const pidNum = parseInt(pid, 10);
  core.info(`[sonar-proxy] Stopping proxy (PID=${pidNum})…`);

  try {
    process.kill(pidNum, 'SIGTERM');
    core.info(`[sonar-proxy] Proxy stopped (PID=${pidNum}).`);
  } catch (err) {
    if (err.code === 'ESRCH') {
      // Process already exited – not an error
      core.info(`[sonar-proxy] Proxy (PID=${pidNum}) was already stopped.`);
    } else {
      core.warning(`[sonar-proxy] Could not stop proxy (PID=${pidNum}): ${err.message}`);
    }
  }
}

run();

