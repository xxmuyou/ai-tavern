import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const tasks = {
  "api:cf-types": () =>
    runNpx(["wrangler", "types", "--config", "../../infra/cloudflare/wrangler.jsonc", "src/worker-configuration.d.ts"], {
      cwd: "packages/api",
    }),
  "api:d1-migrate-dev": () =>
    runNpx(["wrangler", "d1", "migrations", "apply", "xtbit-apps-dev", "--remote", "--config", "../../infra/cloudflare/wrangler.jsonc"], {
      cwd: "packages/api",
    }),
  "api:d1-migrate-local": () =>
    runNpx(["wrangler", "d1", "migrations", "apply", "xtbit-apps-dev", "--local", "--config", "../../infra/cloudflare/wrangler.jsonc"], {
      cwd: "packages/api",
    }),
  "api:d1-migrate-prod": () =>
    runNpx(["wrangler", "d1", "migrations", "apply", "xtbit-apps-prod", "--remote", "--config", "../../infra/cloudflare/wrangler.jsonc"], {
      cwd: "packages/api",
    }),
  "api:deploy-dev": () =>
    runNpx(["wrangler", "deploy", "--config", "../../infra/cloudflare/wrangler.jsonc", "--env="], {
      cwd: "packages/api",
      envFile: ".env.dev",
    }),
  "api:dev": () =>
    runNpx(["wrangler", "dev", "--config", "../../infra/cloudflare/wrangler.jsonc"], {
      cwd: "packages/api",
      envFile: ".env.dev",
    }),
  "api:typecheck": async () => {
    await tasks["api:cf-types"]();
    await runNpx(["tsc", "--noEmit"], { cwd: "packages/api" });
  },
  "app:export-web-dev": () =>
    runNpx(["expo", "export", "--platform", "web"], {
      cwd: "apps/app",
      envFile: ".env.dev",
      env: {
        EXPO_PUBLIC_API_BASE_URL: "https://dev.aiappsbox.com/api",
      },
    }),
  "app:web": () => runNpx(["expo", "start", "--web"], { cwd: "apps/app", envFile: ".env.dev" }),
  "deploy:web-dev": async () => {
    await tasks["app:export-web-dev"]();
    await runNpx(
      [
        "wrangler",
        "pages",
        "deploy",
        "apps/app/dist",
        "--project-name",
        "xtbit-apps",
        "--branch",
        "dev",
        "--commit-dirty=true",
        "--commit-hash",
        "local-dev",
        "--commit-message",
        "dev web deploy",
      ],
      { cwd: "." },
    );
  },
};

const taskName = process.argv[2];

if (!taskName || !tasks[taskName]) {
  console.error(`Unknown task '${taskName ?? ""}'. Available tasks:`);
  for (const key of Object.keys(tasks).sort()) {
    console.error(`  - ${key}`);
  }
  process.exit(1);
}

await tasks[taskName]();

function runNpx(args, options = {}) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", "npx", ...args], options);
  }

  return run("npx", args, options);
}

function run(command, args, options = {}) {
  const fileEnv = options.envFile ? readEnvFile(options.envFile) : {};
  const child = spawn(command, args, {
    cwd: resolve(repoRoot, options.cwd ?? "."),
    env: {
      ...process.env,
      ...fileEnv,
      ...(options.env ?? {}),
    },
    shell: false,
    stdio: "inherit",
  });

  return new Promise((resolveRun, rejectRun) => {
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function readEnvFile(relativePath) {
  const fullPath = resolve(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    return {};
  }

  const env = {};
  for (const rawLine of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = unwrapEnvValue(value);
  }

  return env;
}

function unwrapEnvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
