// Athena - CLI Screenshot Engine
// Copyright 2026, Forgeborn
//
// Auto-captures CLI tool output as SVG images.
// Pipeline: detect commands → run with sample args → capture ANSI → render to SVG

import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CLICommandInfo,
  CLIRunConfig,
  CLIScreenshotConfig,
  CLIScreenshotEngineResult,
  CLIScreenshotResult,
} from "../types.js";
import { detectCLICommands } from "./cli-detector.js";
import {
  generateRunConfigs,
  runCLICommand,
  filterUsefulResults,
} from "./cli-runner.js";
import { renderToSvgFile } from "./ansi-renderer.js";

const DEFAULT_OUTPUT_DIR = "docs/screenshots";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Run the full CLI screenshot pipeline:
 * 1. Detect CLI commands from project configuration
 * 2. Generate run configs (--help, --version, etc.)
 * 3. Execute each command and capture output
 * 4. Render ANSI output to SVG images
 * 5. Return results summary
 */
export async function runCLIScreenshotEngine(
  config: CLIScreenshotConfig
): Promise<CLIScreenshotEngineResult> {
  const startTime = Date.now();
  const projectDir = config.projectDir;
  const outputDir = config.outputDir ?? join(projectDir, DEFAULT_OUTPUT_DIR);
  const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;

  console.log(`\nAthena CLI Screenshot Engine`);
  console.log(`============================`);
  console.log(`Project: ${projectDir}`);
  console.log(`Output:  ${outputDir}`);

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Step 1: Get commands to run
  let runConfigs: CLIRunConfig[];

  if (config.commands && config.commands.length > 0) {
    // Use explicit commands from config
    runConfigs = config.commands;
    console.log(`\nUsing ${runConfigs.length} configured command(s)`);
  } else {
    // Auto-detect CLI commands
    console.log(`\nDetecting CLI commands...`);
    const commands = await detectCLICommands(projectDir);

    if (commands.length === 0) {
      console.log(`No CLI commands detected.`);
      return {
        results: [],
        totalCommands: 0,
        totalScreenshots: 0,
        failures: 0,
        duration: Date.now() - startTime,
      };
    }

    console.log(`Detected ${commands.length} command(s):`);
    for (const cmd of commands) {
      console.log(`  - ${cmd.name} (${cmd.source})`);
    }

    // Generate run configs for each command
    runConfigs = commands.flatMap(generateRunConfigs);

    // Also load any extra configs from athena.config.json
    const extraConfigs = await loadCLIConfigFromAthena(projectDir);
    if (extraConfigs.length > 0) {
      runConfigs.push(...extraConfigs);
    }
  }

  console.log(`\nRunning ${runConfigs.length} command(s)...`);

  // Step 2: Execute commands and capture output
  const results: CLIScreenshotResult[] = [];

  for (const runConfig of runConfigs) {
    const label = runConfig.description || `${runConfig.command} ${runConfig.args.join(" ")}`;
    console.log(`  Running: ${label}`);

    const result = await runCLICommand(runConfig, projectDir, timeout);

    if (result.timedOut) {
      console.log(`    Timed out after ${timeout}ms`);
    }

    // Get the output text (prefer combined, fall back to stdout or stderr)
    const output = result.combined.trim() || result.stdout.trim() || result.stderr.trim();

    if (!output) {
      console.log(`    No output captured, skipping`);
      results.push({
        command: runConfig.command,
        args: runConfig.args,
        filePath: "",
        success: false,
        error: "No output captured",
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    // Step 3: Render to SVG
    const filename = buildFilename(runConfig);
    const outputPath = join(outputDir, filename);

    try {
      await renderToSvgFile(output, outputPath, {
        theme: config.theme ?? "dark",
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        width: config.width,
        padding: config.padding,
        title: `$ ${buildCommandTitle(runConfig)}`,
      });

      console.log(`    Saved: ${filename}`);
      results.push({
        command: runConfig.command,
        args: runConfig.args,
        filePath: outputPath,
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`    Error rendering: ${errorMsg}`);
      results.push({
        command: runConfig.command,
        args: runConfig.args,
        filePath: outputPath,
        success: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Summary
  const duration = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`\nCLI Screenshot capture complete!`);
  console.log(`  Commands run:  ${runConfigs.length}`);
  console.log(`  Screenshots:   ${successCount} captured, ${failCount} failed`);
  console.log(`  Duration:      ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Output:        ${outputDir}`);

  return {
    results,
    totalCommands: runConfigs.length,
    totalScreenshots: successCount,
    failures: failCount,
    duration,
  };
}

/**
 * Build a safe filename from a run config.
 * Output: cli-{command}-{args}.svg
 */
function buildFilename(config: CLIRunConfig): string {
  // Extract command name (last part of command path, or script name)
  let cmdName = config.command;

  // Handle "npm run foo" -> "foo"
  const npmMatch = cmdName.match(/npm\s+run\s+(\S+)/);
  if (npmMatch) {
    cmdName = npmMatch[1];
  } else {
    // Handle "node path/to/script.js" -> "script"
    const parts = cmdName.split(/[\s/\\]+/);
    cmdName = parts[parts.length - 1].replace(/\.[a-z]+$/, "");
  }

  // Sanitize args for filename
  const argsPart = config.args
    .map((a) => a.replace(/^-+/, "").replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .join("-");

  const name = argsPart
    ? `cli-${sanitizeFilename(cmdName)}-${sanitizeFilename(argsPart)}`
    : `cli-${sanitizeFilename(cmdName)}`;

  return `${name}.svg`;
}

/**
 * Build a human-readable command title for the terminal chrome.
 */
function buildCommandTitle(config: CLIRunConfig): string {
  // Shorten "node /long/path/to/script.js" to "script.js"
  let cmd = config.command;
  const npmMatch = cmd.match(/npm\s+run\s+(\S+)/);
  if (npmMatch) {
    cmd = `npm run ${npmMatch[1]}`;
  }

  return config.args.length > 0
    ? `${cmd} ${config.args.join(" ")}`
    : cmd;
}

/**
 * Sanitize a string for use in filenames.
 */
function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Load CLI run configs from athena.config.json if present.
 */
async function loadCLIConfigFromAthena(
  projectDir: string
): Promise<CLIRunConfig[]> {
  const configPath = join(projectDir, "athena.config.json");
  if (!existsSync(configPath)) return [];

  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const cli = config.cli as Record<string, unknown> | undefined;
    if (!cli?.runs) return [];

    return (
      cli.runs as Array<{
        command: string;
        args?: string[];
        description?: string;
        stdin?: string;
        timeout?: number;
      }>
    ).map((r) => ({
      command: r.command,
      args: r.args ?? [],
      description: r.description ?? r.command,
      stdin: r.stdin,
      timeout: r.timeout,
    }));
  } catch {
    return [];
  }
}

/**
 * Load CLI screenshot config from athena.config.json.
 */
export async function loadCLIScreenshotConfig(
  projectDir: string
): Promise<Partial<CLIScreenshotConfig>> {
  const configPath = join(projectDir, "athena.config.json");
  if (!existsSync(configPath)) return {};

  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const cli = config.cli as Record<string, unknown> | undefined;
    if (!cli) return {};

    const result: Partial<CLIScreenshotConfig> = {};

    if (cli.outputDir) result.outputDir = cli.outputDir as string;
    if (cli.timeout) result.timeout = cli.timeout as number;
    if (cli.theme) result.theme = cli.theme as "dark" | "light";
    if (cli.fontFamily) result.fontFamily = cli.fontFamily as string;
    if (cli.fontSize) result.fontSize = cli.fontSize as number;
    if (cli.width) result.width = cli.width as number;
    if (cli.padding) result.padding = cli.padding as number;

    return result;
  } catch {
    return {};
  }
}
