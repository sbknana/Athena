// Athena - Screenshot Capturer
// Copyright 2026, Forgeborn

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  ViewportConfig,
  ThemeName,
  RouteScreenshotConfig,
  InteractiveAction,
  ScreenshotResult,
  AuthConfig,
} from "../types.js";
import { performLogin } from "./auth-handler.js";

const DEFAULT_TIMEOUT = 15_000;

const VIEWPORTS: Record<string, ViewportConfig> = {
  mobile: { name: "mobile", width: 375, height: 812 },
  tablet: { name: "tablet", width: 768, height: 1024 },
  desktop: { name: "desktop", width: 1440, height: 900 },
};

/**
 * Capture screenshots for a list of routes across viewports and themes.
 */
export async function captureScreenshots(
  baseUrl: string,
  routes: RouteScreenshotConfig[],
  viewports: ViewportConfig[],
  themes: ThemeName[],
  outputDir: string,
  auth?: AuthConfig,
  fullPage: boolean = true,
  timeout: number = DEFAULT_TIMEOUT
): Promise<ScreenshotResult[]> {
  const results: ScreenshotResult[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
        console.log(`\n  Viewport: ${viewport.name} (${viewport.width}x${viewport.height}), Theme: ${theme}`);

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: theme === "dark" ? "dark" : "light",
          deviceScaleFactor: viewport.name === "mobile" ? 2 : 1,
        });

        const page = await context.newPage();

        // Handle auth if configured
        let loggedIn = false;
        if (auth) {
          loggedIn = await performLogin(page, baseUrl, auth);
        }

        // Screenshot each route
        for (const route of routes) {
          // Skip auth-required routes if not logged in
          if (!loggedIn && route.category === "admin" && !route.skipAuth) {
            results.push({
              route: route.route,
              viewport: viewport.name,
              theme,
              filePath: "",
              timestamp: new Date().toISOString(),
              success: false,
              error: "Skipped: auth required but login failed",
            });
            continue;
          }

          const routeResults = await captureRoute(
            page,
            baseUrl,
            route,
            viewport,
            theme,
            outputDir,
            fullPage,
            timeout
          );
          results.push(...routeResults);
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function captureRoute(
  page: Page,
  baseUrl: string,
  route: RouteScreenshotConfig,
  viewport: ViewportConfig,
  theme: ThemeName,
  outputDir: string,
  fullPage: boolean,
  timeout: number
): Promise<ScreenshotResult[]> {
  const results: ScreenshotResult[] = [];
  const routeName = sanitizeRouteName(route.route);
  const timestamp = new Date().toISOString();

  const url = route.route.startsWith("http")
    ? route.route
    : `${baseUrl}${route.route}`;

  try {
    // Navigate to the route
    await page.goto(url, { waitUntil: "networkidle", timeout });

    // Wait for custom selector if specified
    if (route.waitForSelector) {
      await page.waitForSelector(route.waitForSelector, { timeout: 5_000 });
    }

    // Wait a bit for animations to settle
    await page.waitForTimeout(500);

    // Apply dark mode via CSS if theme is dark and page doesn't support prefers-color-scheme
    if (theme === "dark") {
      await applyDarkModeHint(page);
    }

    // Capture viewport screenshot
    const viewportPath = join(
      outputDir,
      `${routeName}-${viewport.name}-${theme}.png`
    );
    await ensureDir(viewportPath);
    await page.screenshot({ path: viewportPath, fullPage: false });

    results.push({
      route: route.route,
      viewport: viewport.name,
      theme,
      filePath: viewportPath,
      timestamp,
      success: true,
    });

    // Capture full page screenshot
    if (fullPage) {
      const fullPagePath = join(
        outputDir,
        `${routeName}-${viewport.name}-${theme}-full.png`
      );
      await page.screenshot({ path: fullPagePath, fullPage: true });

      results.push({
        route: route.route,
        viewport: viewport.name,
        theme,
        filePath: fullPagePath,
        fullPagePath,
        timestamp,
        success: true,
      });
    }

    // Execute interactive actions if defined
    if (route.actions && route.actions.length > 0) {
      for (const action of route.actions) {
        try {
          await executeAction(page, action);

          const actionName = sanitizeRouteName(action.description);
          const actionPath = join(
            outputDir,
            `${routeName}-${viewport.name}-${theme}-${actionName}.png`
          );
          await page.screenshot({ path: actionPath, fullPage: false });

          results.push({
            route: route.route,
            viewport: viewport.name,
            theme,
            filePath: actionPath,
            timestamp,
            success: true,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.log(`    Action "${action.description}" failed: ${msg}`);
        }
      }
    }

    console.log(`    ${route.route} - OK`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`    ${route.route} - FAILED: ${msg}`);
    results.push({
      route: route.route,
      viewport: viewport.name,
      theme,
      filePath: "",
      timestamp,
      success: false,
      error: msg,
    });
  }

  return results;
}

async function executeAction(page: Page, action: InteractiveAction): Promise<void> {
  const element = page.locator(action.selector).first();

  switch (action.type) {
    case "click":
      await element.click({ timeout: 3_000 });
      break;
    case "hover":
      await element.hover({ timeout: 3_000 });
      break;
    case "fill":
      await element.fill(action.value ?? "", { timeout: 3_000 });
      break;
    case "select":
      await element.selectOption(action.value ?? "", { timeout: 3_000 });
      break;
  }

  // Wait after action
  const waitMs = action.waitAfterMs ?? 500;
  await page.waitForTimeout(waitMs);
}

async function applyDarkModeHint(page: Page): Promise<void> {
  // Add data attribute and class that many CSS frameworks check
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  // Wait for CSS transitions
  await page.waitForTimeout(300);
}

function sanitizeRouteName(route: string): string {
  return route
    .replace(/^\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    || "home";
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export { VIEWPORTS };
