// Athena - Screenshot Manifest Generator
// Copyright 2026, TheForge, LLC

import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import type {
  ScreenshotResult,
  ScreenshotManifest,
  ScreenshotInfo,
  RouteScreenshotConfig,
} from "../types.js";

interface RouteManifestEntry {
  route: string;
  description: string;
  screenshots: ScreenshotInfo[];
}

export interface FullScreenshotManifest extends ScreenshotManifest {
  projectDir: string;
  routes: RouteManifestEntry[];
  summary: {
    totalRoutes: number;
    totalScreenshots: number;
    failures: number;
    viewports: string[];
    themes: string[];
  };
}

/**
 * Generate a screenshot manifest from capture results.
 */
export function buildManifest(
  results: ScreenshotResult[],
  routes: RouteScreenshotConfig[],
  projectDir: string,
  outputDir: string
): FullScreenshotManifest {
  const successResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);

  // Group screenshots by route
  const routeMap = new Map<string, ScreenshotInfo[]>();
  for (const result of successResults) {
    if (!routeMap.has(result.route)) {
      routeMap.set(result.route, []);
    }
    routeMap.get(result.route)!.push({
      path: relative(outputDir, result.filePath),
      route: result.route,
      description: `${result.viewport} ${result.theme}${result.fullPagePath ? " (full page)" : ""}`,
      viewport: result.viewport,
      theme: result.theme,
    });
  }

  // Build route entries
  const routeEntries: RouteManifestEntry[] = [];
  for (const routeConfig of routes) {
    const screenshots = routeMap.get(routeConfig.route) ?? [];
    routeEntries.push({
      route: routeConfig.route,
      description: routeConfig.description ?? routeConfig.route,
      screenshots,
    });
  }

  // Collect unique viewports and themes
  const viewports = [...new Set(successResults.map((r) => r.viewport))];
  const themes = [...new Set(successResults.map((r) => r.theme))];

  // Build flat screenshots list for the base ScreenshotManifest
  const allScreenshots: ScreenshotInfo[] = successResults.map((r) => ({
    path: relative(outputDir, r.filePath),
    route: r.route,
    viewport: r.viewport,
    theme: r.theme,
  }));

  return {
    screenshots: allScreenshots,
    capturedAt: new Date().toISOString(),
    projectDir,
    routes: routeEntries,
    summary: {
      totalRoutes: routes.length,
      totalScreenshots: successResults.length,
      failures: failedResults.length,
      viewports,
      themes,
    },
  };
}

/**
 * Write the manifest to disk as JSON.
 */
export async function writeManifest(
  manifest: FullScreenshotManifest,
  outputPath: string
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`  Screenshot manifest written to ${outputPath}`);
}

/**
 * Load an existing manifest from disk.
 */
export async function loadManifest(
  path: string
): Promise<FullScreenshotManifest | null> {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as FullScreenshotManifest;
}
