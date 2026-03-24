// Athena - Dev Server Manager
// Copyright 2026, Forgeborn

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";

const DEFAULT_PORT = 3000;
const SERVER_READY_TIMEOUT_MS = 60_000;
const PORT_CHECK_INTERVAL_MS = 500;

export interface DevServerInfo {
  process: ChildProcess | null;
  port: number;
  baseUrl: string;
  wasAlreadyRunning: boolean;
}

/**
 * Detect the dev server start command from package.json.
 */
export async function detectDevCommand(
  projectDir: string
): Promise<{ command: string; port: number } | null> {
  const packageJsonPath = join(projectDir, "package.json");
  if (!existsSync(packageJsonPath)) return null;

  const raw = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;

  // Priority order for dev server commands
  const candidates = ["dev", "start:dev", "serve", "start"];
  for (const name of candidates) {
    if (scripts[name]) {
      const port = extractPort(scripts[name]) ?? DEFAULT_PORT;
      return { command: `npm run ${name}`, port };
    }
  }

  return null;
}

/**
 * Try to extract a port number from a dev command string.
 */
function extractPort(command: string): number | null {
  // Match patterns like --port 3001, -p 8080, PORT=4000
  const portPatterns = [
    /--port\s+(\d+)/,
    /-p\s+(\d+)/,
    /PORT=(\d+)/,
    /:(\d{4,5})(?:\s|$)/,
  ];

  for (const pattern of portPatterns) {
    const match = command.match(pattern);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Check if a port is already in use (server already running).
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Wait for a port to become available (server to start).
 */
async function waitForPort(
  port: number,
  timeoutMs: number = SERVER_READY_TIMEOUT_MS
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, PORT_CHECK_INTERVAL_MS));
  }
  return false;
}

/**
 * Start the dev server if it's not already running.
 * Returns server info including the process handle for cleanup.
 */
export async function startDevServer(
  projectDir: string,
  command?: string,
  port?: number
): Promise<DevServerInfo> {
  // Detect command and port if not provided
  if (!command || !port) {
    const detected = await detectDevCommand(projectDir);
    if (!command) command = detected?.command ?? "npm run dev";
    if (!port) port = detected?.port ?? DEFAULT_PORT;
  }

  const baseUrl = `http://localhost:${port}`;

  // Check if server is already running
  if (await isPortInUse(port)) {
    console.log(`  Dev server already running on port ${port}`);
    return { process: null, port, baseUrl, wasAlreadyRunning: true };
  }

  console.log(`  Starting dev server: ${command} (port ${port})`);

  // Start the server process
  const serverProcess = spawn("sh", ["-c", command], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, PORT: String(port), BROWSER: "none" },
  });

  // Log server output for debugging
  serverProcess.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.log(`  [server] ${line}`);
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.log(`  [server:err] ${line}`);
  });

  // Wait for server to be ready
  const ready = await waitForPort(port);
  if (!ready) {
    stopDevServer({ process: serverProcess, port, baseUrl, wasAlreadyRunning: false });
    throw new Error(
      `Dev server failed to start within ${SERVER_READY_TIMEOUT_MS / 1000}s on port ${port}`
    );
  }

  console.log(`  Dev server ready at ${baseUrl}`);
  return { process: serverProcess, port, baseUrl, wasAlreadyRunning: false };
}

/**
 * Stop the dev server if we started it.
 */
export function stopDevServer(server: DevServerInfo): void {
  if (server.wasAlreadyRunning || !server.process) return;

  console.log("  Stopping dev server...");
  try {
    // Kill the process group (server + child processes)
    if (server.process.pid) {
      process.kill(-server.process.pid, "SIGTERM");
    }
  } catch {
    // Process may have already exited
    try {
      server.process.kill("SIGKILL");
    } catch {
      // Already dead
    }
  }
}
