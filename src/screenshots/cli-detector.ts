// Athena - CLI Command Detector
// Copyright 2026, Forgeborn

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { CLICommandInfo } from "../types.js";

/**
 * Detect CLI commands from a project directory.
 * Sources checked (in order):
 * 1. athena.config.json cli.commands
 * 2. package.json bin entries
 * 3. package.json scripts (filtered to likely CLI commands)
 * 4. Python setup.py / pyproject.toml console_scripts
 */
export async function detectCLICommands(
  projectDir: string
): Promise<CLICommandInfo[]> {
  const commands: CLICommandInfo[] = [];

  // 1. Check athena.config.json for explicit CLI commands
  const athenaCommands = await detectFromAthenaConfig(projectDir);
  commands.push(...athenaCommands);

  // If athena.config.json explicitly listed commands, use those only
  if (athenaCommands.length > 0) {
    return commands;
  }

  // 2. Check package.json bin entries
  const binCommands = await detectFromPackageJsonBin(projectDir);
  commands.push(...binCommands);

  // 3. Check package.json scripts
  const scriptCommands = await detectFromPackageJsonScripts(projectDir);
  commands.push(...scriptCommands);

  // 4. Check Python entry points
  const pythonCommands = await detectFromPythonConfig(projectDir);
  commands.push(...pythonCommands);

  // Deduplicate by command name
  const seen = new Set<string>();
  return commands.filter((cmd) => {
    if (seen.has(cmd.name)) return false;
    seen.add(cmd.name);
    return true;
  });
}

/**
 * Detect CLI commands from athena.config.json.
 */
async function detectFromAthenaConfig(
  projectDir: string
): Promise<CLICommandInfo[]> {
  const configPath = join(projectDir, "athena.config.json");
  if (!existsSync(configPath)) return [];

  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const cli = config.cli as Record<string, unknown> | undefined;
    if (!cli?.commands) return [];

    const commands = cli.commands as Array<{
      name: string;
      command: string;
      description?: string;
    }>;

    return commands.map((cmd) => ({
      name: cmd.name,
      command: cmd.command,
      source: "athena.config.json" as const,
      description: cmd.description,
    }));
  } catch {
    return [];
  }
}

/**
 * Detect CLI commands from package.json bin entries.
 */
async function detectFromPackageJsonBin(
  projectDir: string
): Promise<CLICommandInfo[]> {
  const pkg = await loadPackageJson(projectDir);
  if (!pkg) return [];

  const bin = pkg.bin as Record<string, string> | string | undefined;
  if (!bin) return [];

  const commands: CLICommandInfo[] = [];

  if (typeof bin === "string") {
    // Single bin entry: use package name
    const name = (pkg.name as string) ?? basename(projectDir);
    commands.push({
      name,
      command: `node ${join(projectDir, bin)}`,
      source: "package.json:bin",
      description: pkg.description as string | undefined,
    });
  } else if (typeof bin === "object") {
    for (const [name, path] of Object.entries(bin)) {
      commands.push({
        name,
        command: `node ${join(projectDir, path)}`,
        source: "package.json:bin",
      });
    }
  }

  return commands;
}

/**
 * Detect CLI-like scripts from package.json.
 * Filters to scripts that are likely CLI tools (not dev servers, builds, etc.).
 */
async function detectFromPackageJsonScripts(
  projectDir: string
): Promise<CLICommandInfo[]> {
  const pkg = await loadPackageJson(projectDir);
  if (!pkg) return [];

  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const commands: CLICommandInfo[] = [];

  // Scripts that are likely CLI commands (not dev/build/test/lint)
  const skipPrefixes = [
    "dev",
    "build",
    "test",
    "lint",
    "format",
    "watch",
    "serve",
    "start",
    "prebuild",
    "postbuild",
    "pretest",
    "posttest",
    "prepare",
    "prepublish",
    "preinstall",
    "postinstall",
  ];

  for (const [name, script] of Object.entries(scripts)) {
    // Skip common non-CLI scripts
    if (skipPrefixes.some((p) => name.startsWith(p))) continue;
    // Skip scripts that start dev servers
    if (script.includes("webpack-dev") || script.includes("vite") || script.includes("next dev")) continue;

    commands.push({
      name,
      command: `npm run ${name}`,
      source: "package.json:scripts",
    });
  }

  return commands;
}

/**
 * Detect CLI commands from Python project configs.
 */
async function detectFromPythonConfig(
  projectDir: string
): Promise<CLICommandInfo[]> {
  const commands: CLICommandInfo[] = [];

  // Check pyproject.toml for console_scripts
  const pyprojectPath = join(projectDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const raw = await readFile(pyprojectPath, "utf-8");
      // Simple regex for [project.scripts] or [tool.poetry.scripts] entries
      const scriptSection = raw.match(
        /\[(?:project\.scripts|tool\.poetry\.scripts)\]([\s\S]*?)(?:\n\[|$)/
      );
      if (scriptSection) {
        const entries = scriptSection[1].matchAll(
          /^(\w[\w-]*)\s*=\s*"([^"]+)"/gm
        );
        for (const match of entries) {
          commands.push({
            name: match[1],
            command: match[1],
            source: "detected",
            description: `Python entry point: ${match[2]}`,
          });
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Check setup.py for console_scripts
  const setupPath = join(projectDir, "setup.py");
  if (existsSync(setupPath)) {
    try {
      const raw = await readFile(setupPath, "utf-8");
      const entries = raw.matchAll(
        /['"](\w[\w-]*)\s*=\s*[\w.]+:[\w]+['"]/g
      );
      for (const match of entries) {
        commands.push({
          name: match[1],
          command: match[1],
          source: "detected",
        });
      }
    } catch {
      // ignore
    }
  }

  return commands;
}

/**
 * Load and parse package.json from a project directory.
 */
async function loadPackageJson(
  projectDir: string
): Promise<Record<string, unknown> | null> {
  const path = join(projectDir, "package.json");
  if (!existsSync(path)) return null;

  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
