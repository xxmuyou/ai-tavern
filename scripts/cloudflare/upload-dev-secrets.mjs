import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const allowedSecrets = new Set([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SESSION_SECRET",
  "OPENAI_API_KEY",
]);

const args = process.argv.slice(2);
const secretsFile = resolve(readArg("--secrets-file") ?? "./tmp/cloudflare-dev-secrets.env");
const configFile = resolve(readArg("--config") ?? "./infra/cloudflare/wrangler.jsonc");

if (!existsSync(secretsFile)) {
  throw new Error(`Secrets file not found: ${secretsFile}`);
}

if (!existsSync(configFile)) {
  throw new Error(`Wrangler config not found: ${configFile}`);
}

console.log(`Reading Cloudflare dev secrets from ${secretsFile}`);
console.log(`Using Wrangler config ${configFile}`);

for (const entry of parseSecrets(readFileSync(secretsFile, "utf8"))) {
  if (!allowedSecrets.has(entry.key)) {
    throw new Error(
      `Secret '${entry.key}' is not in the allowlist: ${[...allowedSecrets].join(", ")}`,
    );
  }

  if (!entry.value) {
    console.log(`Skipping empty secret ${entry.key}`);
    continue;
  }

  console.log(`Uploading ${entry.key} to Cloudflare dev Worker...`);
  await uploadSecret(entry.key, entry.value);
}

console.log(`Done. Delete or clear ${secretsFile} when you no longer need the local copy.`);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseSecrets(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");

      if (separatorIndex <= 0) {
        throw new Error("Invalid secrets line. Expected KEY=value.");
      }

      return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
}

function uploadSecret(key, value) {
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx", "wrangler", "secret", "put", key, "--config", configFile, "--env="]
      : ["wrangler", "secret", "put", key, "--config", configFile, "--env="];
  const child = spawn(
    command,
    args,
    {
      shell: false,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );

  child.stdin.end(`${value}\n`);

  return new Promise((resolveUpload, rejectUpload) => {
    child.on("error", rejectUpload);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveUpload();
        return;
      }

      rejectUpload(new Error(`wrangler secret put ${key} failed with exit code ${code}`));
    });
  });
}
