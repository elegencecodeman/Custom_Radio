import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(cwd = process.cwd()) {
  const envPaths = [resolve(cwd, "server", ".env"), resolve(cwd, ".env.local")];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    const rows = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const row of rows) {
      const line = row.trim();
      if (!line || line.startsWith("#")) continue;
      const splitAt = line.indexOf("=");
      if (splitAt === -1) continue;
      const key = line.slice(0, splitAt).trim();
      const rawValue = line.slice(splitAt + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}
