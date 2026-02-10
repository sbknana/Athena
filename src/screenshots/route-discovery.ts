// Athena - Route Discovery for Screenshot Engine
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import { glob } from "glob";
import type {
  ProjectManifest,
  RouteInfo,
  RouteScreenshotConfig,
  Framework,
} from "../types.js";

/**
 * Discover routes from a project manifest or by scanning the project directory.
 * Returns a list of route configs ready for the screenshot engine.
 */
export async function discoverRoutes(
  projectDir: string,
  manifest?: ProjectManifest
): Promise<RouteScreenshotConfig[]> {
  // If manifest has routes, use those
  if (manifest && manifest.routes.length > 0) {
    return routeInfoToScreenshotConfigs(manifest.routes);
  }

  // Otherwise, detect framework and scan
  const framework = manifest?.framework ?? "unknown";
  return discoverRoutesByFramework(projectDir, framework);
}

function routeInfoToScreenshotConfigs(
  routes: RouteInfo[]
): RouteScreenshotConfig[] {
  // Only include GET routes (pages) or routes without a method (assumed pages)
  const pageRoutes = routes.filter(
    (r) => !r.method || r.method.toUpperCase() === "GET"
  );

  return pageRoutes.map((route) => ({
    route: route.path,
    description: `Page from ${basename(route.file)}`,
    category: categorizeRoute(route.path),
  }));
}

function categorizeRoute(
  path: string
): "page" | "login" | "admin" | "empty-state" {
  const lower = path.toLowerCase();
  if (
    lower.includes("login") ||
    lower.includes("signin") ||
    lower.includes("sign-in") ||
    lower.includes("auth")
  ) {
    return "login";
  }
  if (
    lower.includes("admin") ||
    lower.includes("dashboard") ||
    lower.includes("manage")
  ) {
    return "admin";
  }
  return "page";
}

async function discoverRoutesByFramework(
  projectDir: string,
  framework: Framework
): Promise<RouteScreenshotConfig[]> {
  switch (framework) {
    case "nextjs":
      return discoverNextJsRoutes(projectDir);
    case "react":
    case "vue":
    case "angular":
      return discoverSPARoutes(projectDir, framework);
    case "express":
    case "fastify":
    case "nestjs":
      return discoverExpressRoutes(projectDir);
    default:
      // Fallback: just screenshot the root
      return [{ route: "/", description: "Home page", category: "page" }];
  }
}

async function discoverNextJsRoutes(
  projectDir: string
): Promise<RouteScreenshotConfig[]> {
  const routes: RouteScreenshotConfig[] = [];

  // Check for App Router (app/ directory)
  const appDir =
    findDir(projectDir, "src/app") ?? findDir(projectDir, "app") ?? null;

  if (appDir) {
    const pageFiles = await glob("**/page.{tsx,jsx,ts,js}", {
      cwd: appDir,
      absolute: true,
    });

    for (const pageFile of pageFiles) {
      const relDir = relative(appDir, dirname(pageFile));
      let routePath = "/" + relDir.replace(/\\/g, "/");

      // Filter out dynamic segments for screenshots (can't screenshot [id])
      if (routePath.includes("[")) continue;

      // Clean up route path
      if (routePath === "/.") routePath = "/";
      routePath = routePath.replace(/\/+$/, "") || "/";

      routes.push({
        route: routePath,
        description: `Next.js page: ${routePath}`,
        category: categorizeRoute(routePath),
      });
    }
  }

  // Check for Pages Router (pages/ directory)
  const pagesDir =
    findDir(projectDir, "src/pages") ?? findDir(projectDir, "pages") ?? null;

  if (pagesDir) {
    const pageFiles = await glob("**/*.{tsx,jsx,ts,js}", {
      cwd: pagesDir,
      absolute: true,
      ignore: ["_app.*", "_document.*", "_error.*", "api/**"],
    });

    for (const pageFile of pageFiles) {
      const relPath = relative(pagesDir, pageFile);
      let routePath =
        "/" +
        relPath
          .replace(/\\/g, "/")
          .replace(/\.(tsx|jsx|ts|js)$/, "")
          .replace(/\/index$/, "");

      // Skip dynamic routes
      if (routePath.includes("[")) continue;

      routePath = routePath || "/";
      routes.push({
        route: routePath,
        description: `Next.js page: ${routePath}`,
        category: categorizeRoute(routePath),
      });
    }
  }

  // Always ensure root route exists
  if (routes.length === 0 || !routes.some((r) => r.route === "/")) {
    routes.unshift({
      route: "/",
      description: "Home page",
      category: "page",
    });
  }

  return deduplicateRoutes(routes);
}

async function discoverSPARoutes(
  projectDir: string,
  framework: Framework
): Promise<RouteScreenshotConfig[]> {
  const routes: RouteScreenshotConfig[] = [
    { route: "/", description: "Home page", category: "page" },
  ];

  // Search for React Router / Vue Router / Angular route definitions
  const srcDir = findDir(projectDir, "src") ?? projectDir;
  const sourceFiles = await glob("**/*.{tsx,jsx,ts,js,vue}", {
    cwd: srcDir,
    absolute: true,
    ignore: ["node_modules/**", "dist/**", "build/**"],
  });

  for (const file of sourceFiles) {
    const content = await readFile(file, "utf-8");
    const extracted = extractRoutePaths(content, framework);
    for (const routePath of extracted) {
      if (routePath.includes(":") || routePath.includes("*")) continue;
      routes.push({
        route: routePath,
        description: `${framework} route: ${routePath}`,
        category: categorizeRoute(routePath),
      });
    }
  }

  return deduplicateRoutes(routes);
}

function extractRoutePaths(content: string, framework: Framework): string[] {
  const paths: string[] = [];

  if (framework === "react") {
    // React Router: <Route path="/about" ...>
    const routeRegex = /path\s*[=:]\s*["']([^"']+)["']/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      paths.push(match[1]);
    }
  } else if (framework === "vue") {
    // Vue Router: { path: '/about' }
    const routeRegex = /path\s*:\s*["']([^"']+)["']/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      paths.push(match[1]);
    }
  } else if (framework === "angular") {
    // Angular: { path: 'about' }
    const routeRegex = /path\s*:\s*["']([^"']+)["']/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      const p = match[1];
      paths.push(p.startsWith("/") ? p : "/" + p);
    }
  }

  return paths;
}

async function discoverExpressRoutes(
  projectDir: string
): Promise<RouteScreenshotConfig[]> {
  const routes: RouteScreenshotConfig[] = [
    { route: "/", description: "Home page", category: "page" },
  ];

  const srcDir = findDir(projectDir, "src") ?? projectDir;
  const sourceFiles = await glob("**/*.{ts,js}", {
    cwd: srcDir,
    absolute: true,
    ignore: ["node_modules/**", "dist/**", "build/**", "test/**"],
  });

  for (const file of sourceFiles) {
    const content = await readFile(file, "utf-8");
    // Match Express route patterns: app.get('/path', ...) or router.get('/path', ...)
    const routeRegex =
      /\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2];
      // Only screenshot GET routes (pages)
      if (method === "GET" && !path.includes(":") && !path.startsWith("/api")) {
        routes.push({
          route: path,
          description: `Express GET: ${path}`,
          category: categorizeRoute(path),
        });
      }
    }
  }

  return deduplicateRoutes(routes);
}

function findDir(base: string, sub: string): string | undefined {
  const full = join(base, sub);
  return existsSync(full) ? full : undefined;
}

function deduplicateRoutes(
  routes: RouteScreenshotConfig[]
): RouteScreenshotConfig[] {
  const seen = new Set<string>();
  return routes.filter((r) => {
    if (seen.has(r.route)) return false;
    seen.add(r.route);
    return true;
  });
}
