// Athena - CLI Command Runner
// Copyright 2026, TheForge, LLC

import { spawn } from "node:child_process";
import type { CLICommandInfo, CLIRunConfig, CLIRunResult } from "../types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Generate sample run configs for a detected CLI command.
 * Tries --help, --version, and basic usage patterns.
 */
export function generateRunConfigs(
  command: CLICommandInfo
): CLIRunConfig[] {
  const configs: CLIRunConfig[] = [];

  // Always try --help
  configs.push({
    command: command.command,
    args: ["--help"],
    description: `${command.name} --help`,
  });

  // Try --version
  configs.push({
    command: command.command,
    args: ["--version"],
    description: `${command.name} --version`,
  });

  return configs;
}

/**
 * Run a CLI command and capture stdout/stderr as raw text (including ANSI codes).
 */
export async function runCLICommand(
  config: CLIRunConfig,
  cwd: string,
  timeoutMs?: number
): Promise<CLIRunResult> {
  const timeout = config.timeout ?? timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const [cmd, ...baseArgs] = parseCommand(config.command);
    const allArgs = [...baseArgs, ...config.args];

    const proc = spawn(cmd, allArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Force color output for ANSI capture
        FORCE_COLOR: "1",
        CLICOLOR_FORCE: "1",
        TERM: "xterm-256color",
        COLUMNS: "100",
        LINES: "40",
      },
      timeout,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const combinedChunks: Buffer[] = [];
    let timedOut = false;

    proc.stdout?.on("data", (data: Buffer) => {
      stdoutChunks.push(data);
      combinedChunks.push(data);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderrChunks.push(data);
      combinedChunks.push(data);
    });

    // Provide stdin if configured, then close
    if (config.stdin) {
      proc.stdin?.write(config.stdin);
    }
    proc.stdin?.end();

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 1000);
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      resolve({
        command: config.command,
        args: config.args,
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        combined: Buffer.concat(combinedChunks).toString("utf-8"),
        timedOut,
        duration,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      resolve({
        command: config.command,
        args: config.args,
        exitCode: null,
        stdout: "",
        stderr: err.message,
        combined: err.message,
        timedOut: false,
        duration,
      });
    });
  });
}

/**
 * Parse a command string into command and arguments.
 * Handles "npm run foo", "node path/to/script.js", "python script.py", etc.
 */
function parseCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of command) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " ") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current) parts.push(current);
  return parts.length > 0 ? parts : ["echo", "no command"];
}

/**
 * Filter out run results that don't have useful output.
 * Removes commands that produced empty output or only error messages about
 * unrecognized flags.
 */
export function filterUsefulResults(results: CLIRunResult[]): CLIRunResult[] {
  return results.filter((r) => {
    // Keep if there's any stdout
    if (r.stdout.trim().length > 0) return true;
    // Keep if stderr has content that isn't just "unknown option"
    if (r.stderr.trim().length > 0 && !r.stderr.includes("unknown option")) return true;
    return false;
  });
}
