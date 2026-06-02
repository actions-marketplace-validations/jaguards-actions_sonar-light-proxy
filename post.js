#!/usr/bin/env node
'use strict';
/**
 * post.js – GitHub Action post-step entry point.
 *
 * Reads the proxy PID saved by main.js and sends SIGTERM to stop the process.
 * Runs automatically at the end of the job (even on failure) because
 * action.yml sets post-if: always().
 *
 * No external dependencies – uses only Node.js built-ins and native
 * GitHub Actions workflow commands / environment variables.
 */

// ── GitHub Actions helpers (no @actions/core needed) ─────────────────────────

/** Read a state value saved by the main step via saveState(). */
function getState(name) {
  return (process.env[`STATE_${name}`] || '').trim();
}

function info(msg)    { console.log(msg); }
function warning(msg) { process.stdout.write(`::warning::${msg}\n`); }

// ── Main ──────────────────────────────────────────────────────────────────────

function run() {
  const pid = getState('SONAR_PROXY_PID');

  if (!pid) {
    info('[sonar-proxy] No proxy PID found in state – nothing to stop.');
    return;
  }

  const pidNum = parseInt(pid, 10);
  info(`[sonar-proxy] Stopping proxy (PID=${pidNum})…`);

  try {
    process.kill(pidNum, 'SIGTERM');
    info(`[sonar-proxy] Proxy stopped (PID=${pidNum}).`);
  } catch (err) {
    if (err.code === 'ESRCH') {
      // Process already exited – not an error
      info(`[sonar-proxy] Proxy (PID=${pidNum}) was already stopped.`);
    } else {
      warning(`[sonar-proxy] Could not stop proxy (PID=${pidNum}): ${err.message}`);
    }
  }
}

run();
