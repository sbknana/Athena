// Athena - Screenshot Engine (Main Entry Point)
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ScreenshotEngineConfig,
  ScreenshotEngineResult,
  ProjectManifest,
  ViewportConfig,
  ThemeName,
  RouteScreenshotConfig,
  AuthConfig,
} from "../types.js";
import { discoverRoutes } from "./route-discovery.js";
import { startDevServer, stopDevServer, detectDevCommand, type DevServerInfo } from "./dev-server.js";
import { captureScreenshots, VIEWPORTS } from "./capturer.js";
import { loadAuthConfig } from "./auth-handler.js";
import { buildManifest, writeManifest, type FullScreenshotManifest } from "./manifest.js";

const DEFAULT_OUTPUT_DIR = "docs/screenshots";

const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  VIEWPORTS.mobile,
  VIEWPORTS.desktop,
];

const DEFAULT_THEMES: ThemeName[] = ["light", "dark"];

/**
 * Run the full screenshot engine pipeline:
 * 1. Load project manifest (if available)
 * 2. Discover routes
 * 3. Start dev server if needed
 * 4. Capture screenshots for all routes x viewports x themes
 * 5. Generate manifest
 */
export async function runScreenshotEngine(
  config: ScreenshotEngineConfig
): Promise<ScreenshotEngineResult> {
  const startTime = Date.now();
  const projectDir = config.projectDir;
  const outputDir = config.outputDir ?? join(projectDir, DEFAULT_OUTPUT_DIR);

  console.log(`\nAthena Screenshot Engine`);
  console.log(`========================`);
  console.log(`Project: ${projectDir}`);
  console.log(`Output:  ${outputDir}`);

  // Step 1: Load project manifest if available
  const manifest = await loadProjectManifest(projectDir, config.manifestPath);
  if (manifest) {
    console.log(`\nManifest loaded: ${manifest.name} (${manifest.framework})`);
  }

  // Step 2: Discover routes
  let routes = config.routes ?? [];
  if (routes.length === 0) {
    console.log(`\nDiscovering routes...`);
    routes = await discoverRoutes(projectDir, manifest ?? undefined);
  }
  console.log(`Found ${routes.length} route(s): ${routes.map((r) => r.route).join(", ")}`);

  if (routes.length === 0) {
    console.log("No routes found. Adding root route.");
    routes = [{ route: "/", description: "Home page", category: "page" }];
  }

  // Step 3: Load auth config
  let auth: AuthConfig | undefined = config.auth;
  if (!auth) {
    const discovered = await loadAuthConfig(projectDir);
    if (discovered) {
      auth = discovered;
      console.log(`\nAuth config loaded (login URL: ${auth.loginUrl})`);
    }
  }

  // Step 4: Start dev server
  let server: DevServerInfo | null = null;
  let baseUrl = config.baseUrl ?? "";

  if (!baseUrl) {
    console.log(`\nStarting dev server...`);
    server = await startDevServer(
      projectDir,
      config.devServerCommand,
      config.devServerPort
    );
    baseUrl = server.baseUrl;
  }

  // Step 5: Capture screenshots
  const viewports = config.viewports ?? DEFAULT_VIEWPORTS;
  const themes = config.themes ?? DEFAULT_THEMES;
  const fullPage = config.fullPage ?? true;
  const timeout = config.timeout ?? 15_000;

  console.log(
    `\nCapturing screenshots (${routes.length} routes x ${viewports.length} viewports x ${themes.length} themes)...`
  );

  let results;
  try {
    results = await captureScreenshots(
      baseUrl,
      routes,
      viewports,
      themes,
      outputDir,
      auth,
      fullPage,
      timeout
    );
  } finally {
    // Stop dev server if we started it
    if (server) {
      stopDevServer(server);
    }
  }

  // Step 6: Generate manifest
  const fullManifest = buildManifest(results, routes, projectDir, outputDir);
  const manifestPath = config.manifestPath
    ? config.manifestPath.replace(/project-manifest\.json$/, "screenshot-manifest.json")
    : join(outputDir, "screenshot-manifest.json");
  await writeManifest(fullManifest, manifestPath);

  // Summary
  const duration = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`\nScreenshot capture complete!`);
  console.log(`  Routes:      ${routes.length}`);
  console.log(`  Screenshots: ${successCount} captured, ${failCount} failed`);
  console.log(`  Duration:    ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Manifest:    ${manifestPath}`);

  return {
    manifest: fullManifest,
    results,
    totalRoutes: routes.length,
    totalScreenshots: successCount,
    failures: failCount,
    duration,
  };
}

/**
 * Load project manifest from disk if it exists.
 */
async function loadProjectManifest(
  projectDir: string,
  manifestPath?: string
): Promise<ProjectManifest | null> {
  const path = manifestPath ?? join(projectDir, "project-manifest.json");
  if (!existsSync(path)) return null;

  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as ProjectManifest;
  } catch {
    return null;
  }
}

/**
 * Build a screenshot engine config from athena.config.json.
 * This is the recommended way to configure the engine per-project.
 */
export async function loadScreenshotConfig(
  projectDir: string
): Promise<Partial<ScreenshotEngineConfig>> {
  const configPath = join(projectDir, "athena.config.json");
  if (!existsSync(configPath)) return {};

  const raw = await readFile(configPath, "utf-8");
  const config = JSON.parse(raw) as Record<string, unknown>;
  const ssConfig = (config.screenshots ?? {}) as Record<string, unknown>;

  const result: Partial<ScreenshotEngineConfig> = {};

  if (ssConfig.outputDir) result.outputDir = ssConfig.outputDir as string;
  if (ssConfig.baseUrl) result.baseUrl = ssConfig.baseUrl as string;
  if (ssConfig.devServerCommand) result.devServerCommand = ssConfig.devServerCommand as string;
  if (ssConfig.devServerPort) result.devServerPort = ssConfig.devServerPort as number;
  if (ssConfig.timeout) result.timeout = ssConfig.timeout as number;
  if (ssConfig.fullPage !== undefined) result.fullPage = ssConfig.fullPage as boolean;

  if (ssConfig.viewports) {
    result.viewports = (ssConfig.viewports as string[]).map(
      (name) => VIEWPORTS[name] ?? VIEWPORTS.desktop
    );
  }

  if (ssConfig.themes) {
    result.themes = ssConfig.themes as ThemeName[];
  }

  if (ssConfig.routes) {
    result.routes = ssConfig.routes as RouteScreenshotConfig[];
  }

  return result;
}

export { VIEWPORTS, DEFAULT_VIEWPORTS, DEFAULT_THEMES };
