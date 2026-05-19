#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(repoRoot, "tmp", "local-dev.log");
const ports = [8081, 8787];
const children = new Set();

mkdirSync(resolve(repoRoot, "tmp"), { recursive: true });
const logStream = createWriteStream(logPath, { flags: "a" });

console.log("Restarting local dev environment...");
console.log("Using .env.dev for local environment values.");
console.log(`Writing logs to ${logPath}`);

if (!existsSync(resolve(repoRoot, ".env.dev"))) {
  console.warn("Warning: .env.dev was not found. Create it from .env.dev.example if local keys are needed.");
}

await stopPorts(ports);

const api = startProcess("api", ["run", "dev:api"]);
const app = startProcess("app", ["run", "dev:app"]);

console.log("");
console.log("Local dev services are starting:");
console.log("  API: http://127.0.0.1:8787");
console.log("  Web: http://localhost:8081");
console.log("");
console.log("Keep this terminal open. Press Ctrl+C in this terminal to stop both services.");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log("");
    console.log("Stopping local dev services...");
    await stopChildren();
    process.exit(0);
  });
}

await Promise.race([
  waitForExit(api, "api"),
  waitForExit(app, "app"),
]);

await stopChildren();
process.exit(1);

function startProcess(label, args) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  children.add(child);
  child.stdout.on("data", (chunk) => writePrefixed(label, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(label, chunk));
  child.on("exit", () => children.delete(child));

  return child;
}

function writePrefixed(label, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line) {
      const output = `[${label}] ${line}`;
      console.log(output);
      logStream.write(`${new Date().toISOString()} ${output}\n`);
    }
  }
}

function waitForExit(child, label) {
  return new Promise((resolveExit) => {
    child.on("exit", (code) => {
      console.log(`[${label}] exited with code ${code ?? "unknown"}`);
      resolveExit();
    });
  });
}

async function stopChildren() {
  for (const child of [...children]) {
    await stopProcess(child.pid);
  }

  await stopPorts(ports);
}

async function stopPorts(values) {
  if (process.platform === "win32") {
    const portList = values.join(",");
    await runQuiet("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `$ports=@(${portList}); ` +
        "Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue | " +
        "Select-Object -ExpandProperty OwningProcess -Unique | " +
        "Where-Object { $_ -and $_ -ne $PID } | " +
        "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }",
    ]);
    return;
  }

  for (const port of values) {
    const pids = await capture("sh", ["-c", `command -v lsof >/dev/null 2>&1 && lsof -ti tcp:${port} || true`]);
    for (const pid of pids.split(/\s+/).filter(Boolean)) {
      await stopProcess(Number(pid));
    }
  }
}

async function stopProcess(pid) {
  if (!pid || pid === process.pid) {
    return;
  }

  if (process.platform === "win32") {
    await runQuiet("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
    return;
  }

  await runQuiet("kill", ["-TERM", String(pid)]);
}

function runQuiet(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: false,
      stdio: "ignore",
    });
    child.on("error", () => resolveRun());
    child.on("exit", () => resolveRun());
  });
}

function capture(command, args) {
  return new Promise((resolveCapture) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => resolveCapture(""));
    child.on("exit", () => resolveCapture(output));
  });
}
