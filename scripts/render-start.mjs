#!/usr/bin/env node
/**
 * Render start wrapper.
 *
 * Render expects one long-running process that binds to $PORT. Nitro's
 * node-server preset produces .output/server/index.mjs, but if the app
 * throws an unhandled exception the process dies and Render has to spawn a
 * fresh container. This wrapper keeps the same parent PID (so Render's
 * health checks / signals still target the right process) and quickly
 * restarts the server on crash, logging the reason so it can be diagnosed.
 */

import { spawn } from "node:child_process";

const SERVER = ".output/server/index.mjs";
const MAX_RESTARTS = 20;
const RESTART_DELAY_MS = 2_000;

let restartCount = 0;
let lastRestartAt = 0;
let child = null;
let shuttingDown = false;

function log(level, message, extra = "") {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [render-start:${level}] ${message}${extra}`);
}

function startServer() {
  if (shuttingDown) return;

  const now = Date.now();
  if (now - lastRestartAt > 60_000) {
    restartCount = 0;
  }
  restartCount += 1;
  lastRestartAt = now;

  if (restartCount > MAX_RESTARTS) {
    log("fatal", `Server restarted ${MAX_RESTARTS} times in <60s; giving up.`);
    process.exit(1);
  }

  log("info", `Starting server (attempt ${restartCount})…`);

  child = spawn(process.execPath, [SERVER], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  child.on("error", (err) => {
    log("error", "Failed to spawn server: ", err.message);
    scheduleRestart();
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (shuttingDown) return;
    const reason = signal ? `killed by ${signal}` : `exited with code ${code}`;
    log("warn", `Server ${reason}. Restarting…`);
    scheduleRestart();
  });
}

let restartTimer = null;
function scheduleRestart() {
  if (shuttingDown) return;
  if (restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startServer();
  }, RESTART_DELAY_MS);
}

function shutdown(signal) {
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (child) {
    log("info", `Received ${signal}, stopping server…`);
    child.kill(signal);
    const forceKill = setTimeout(() => {
      if (child && !child.killed) {
        child.kill("SIGKILL");
      }
    }, 10_000);
    child.on("exit", () => clearTimeout(forceKill));
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Keep the wrapper alive even if the child crashes; it will be restarted.
process.on("uncaughtException", (err) => {
  log("error", "Uncaught exception in wrapper: ", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection in wrapper: ", String(reason));
});

startServer();
