#!/usr/bin/env node
import { readFileSync } from "node:fs";

const expectedDistro = "Ubuntu";

if (!isUbuntuWsl()) {
  console.error("This project is WSL-first and must be run inside Ubuntu WSL.");
  console.error("");
  console.error("Use:");
  console.error("  wsl.exe -d Ubuntu");
  console.error("  cd /home/pgx123/private/xtbit/publisher-apps/xtbit-apps");
  console.error("");
  console.error("Then rerun the npm command from that Ubuntu shell.");
  process.exit(1);
}

function isUbuntuWsl() {
  if (process.platform !== "linux") {
    return false;
  }

  if (process.env.WSL_DISTRO_NAME && process.env.WSL_DISTRO_NAME !== expectedDistro) {
    return false;
  }

  const release = readProcFile("/proc/sys/kernel/osrelease").toLowerCase();
  const version = readProcFile("/proc/version").toLowerCase();

  return release.includes("microsoft") || release.includes("wsl") || version.includes("microsoft");
}

function readProcFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
