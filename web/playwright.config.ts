import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 8799;
const python = path.resolve(process.cwd(), "..", ".venv", "Scripts", "python.exe");

// A fresh data folder and settings file for each run, never the user's real ones.
// The config file is loaded again in every worker, so the folder name is passed on
// through an environment variable instead of being created twice.
const dataDir = process.env.TODOAPP_E2E_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "todoapp-e2e-"));
process.env.TODOAPP_E2E_DIR = dataDir;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // every test shares one server and one data folder
  reporter: [["list"]],
  use: { channel: "msedge", baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `"${python}" -m todoapp --no-browser --data-dir "${dataDir}" --config "${path.join(dataDir, "settings.json")}" --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
