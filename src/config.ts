// Athena - Config File Loader
// Copyright 2026, Forgeborn

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AthenaConfig } from "./types.js";

const CONFIG_FILENAME = "athena.config.json";

/**
 * Load athena.config.json from a project directory.
 * Returns default config if file doesn't exist.
 */
export async function loadConfig(projectDir: string): Promise<AthenaConfig> {
  const configPath = join(projectDir, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return {};
  }

  const raw = await readFile(configPath, "utf-8");
  const config = JSON.parse(raw) as AthenaConfig;

  // Resolve relative paths in config
  if (config.docs?.outputDir) {
    config.docs.outputDir = resolve(projectDir, config.docs.outputDir);
  }
  if (config.screenshots?.outputDir) {
    config.screenshots.outputDir = resolve(projectDir, config.screenshots.outputDir);
  }
  if (config.freshness?.trackingFile) {
    config.freshness.trackingFile = resolve(projectDir, config.freshness.trackingFile);
  }

  return config;
}

/**
 * Initialize a new athena.config.json in a project directory.
 * Does not overwrite existing config.
 */
export async function initConfig(
  projectDir: string,
  options?: Partial<AthenaConfig>
): Promise<string> {
  const configPath = join(projectDir, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    throw new Error(`Config already exists: ${configPath}`);
  }

  const config: AthenaConfig = {
    projectName: options?.projectName ?? "",
    description: options?.description ?? "",
    devServer: options?.devServer ?? {
      command: "npm run dev",
      port: 3000,
    },
    excludedRoutes: options?.excludedRoutes ?? [],
    docs: options?.docs ?? {
      types: ["readme", "architecture", "api", "deployment", "contributing"],
      model: "speed",
      outputDir: "docs",
      diffMode: true,
    },
    screenshots: options?.screenshots ?? {
      outputDir: "docs/screenshots",
      viewports: ["mobile", "desktop"],
      themes: ["light", "dark"],
      fullPage: true,
    },
    freshness: options?.freshness ?? {
      include: ["src/**/*", "lib/**/*", "app/**/*", "pages/**/*"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "build/**",
        ".git/**",
        "*.lock",
        "*.log",
      ],
      trackingFile: ".athena-freshness.json",
    },
  };

  const json = JSON.stringify(config, null, 2) + "\n";
  await writeFile(configPath, json, "utf-8");

  return configPath;
}

/**
 * Get the config file path for a project.
 */
export function getConfigPath(projectDir: string): string {
  return join(projectDir, CONFIG_FILENAME);
}

/**
 * Check if a project has an athena.config.json.
 */
export function hasConfig(projectDir: string): boolean {
  return existsSync(join(projectDir, CONFIG_FILENAME));
}
