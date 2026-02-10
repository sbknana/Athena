// Athena - Route Detector
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { glob } from "glob";
import type { RouteInfo, Framework } from "../types.js";

export async function detectRoutes(
  projectDir: string,
  framework: Framework
): Promise<{ routes: RouteInfo[]; apiEndpoints: RouteInfo[] }> {
  const routes: RouteInfo[] = [];
  const apiEndpoints: RouteInfo[] = [];

  switch (framework) {
    case "nextjs":
      await detectNextJSRoutes(projectDir, routes, apiEndpoints);
      break;
    case "express":
    case "fastify":
    case "nestjs":
      await detectExpressRoutes(projectDir, apiEndpoints);
      break;
    case "django":
      await detectDjangoRoutes(projectDir, apiEndpoints);
      break;
    case "flask":
    case "fastapi":
      await detectPythonAPIRoutes(projectDir, framework, apiEndpoints);
      break;
    case "aspnet":
      await detectAspNetRoutes(projectDir, apiEndpoints);
      break;
    case "react":
    case "vue":
    case "angular":
      await detectSPARoutes(projectDir, framework, routes);
      break;
  }

  return { routes, apiEndpoints };
}

async function detectNextJSRoutes(
  projectDir: string,
  routes: RouteInfo[],
  apiEndpoints: RouteInfo[]
): Promise<void> {
  // App Router (app/ directory)
  const appDir = existsSync(join(projectDir, "src/app"))
    ? join(projectDir, "src/app")
    : join(projectDir, "app");

  if (existsSync(appDir)) {
    // Page routes
    const pages = await glob("**/page.{ts,tsx,js,jsx}", {
      cwd: appDir,
      absolute: true,
    });
    for (const page of pages) {
      const relPath = relative(appDir, page);
      const routePath = "/" + relPath.replace(/\/page\.\w+$/, "").replace(/\\/g, "/");
      routes.push({
        path: routePath === "/" ? "/" : routePath,
        file: relative(projectDir, page),
      });
    }

    // API routes (route.ts files)
    const apiRoutes = await glob("**/route.{ts,tsx,js,jsx}", {
      cwd: appDir,
      absolute: true,
    });
    for (const route of apiRoutes) {
      const relPath = relative(appDir, route);
      const routePath = "/" + relPath.replace(/\/route\.\w+$/, "").replace(/\\/g, "/");
      const content = await readFile(route, "utf-8");
      const methods = extractHTTPMethods(content);

      for (const method of methods) {
        apiEndpoints.push({
          path: routePath,
          method,
          file: relative(projectDir, route),
        });
      }
    }
  }

  // Pages Router (pages/ directory)
  const pagesDir = existsSync(join(projectDir, "src/pages"))
    ? join(projectDir, "src/pages")
    : join(projectDir, "pages");

  if (existsSync(pagesDir)) {
    const pageFiles = await glob("**/*.{ts,tsx,js,jsx}", {
      cwd: pagesDir,
      absolute: true,
      ignore: ["**/api/**", "**/_app.*", "**/_document.*"],
    });
    for (const page of pageFiles) {
      const relPath = relative(pagesDir, page);
      const routePath =
        "/" + relPath.replace(/\.\w+$/, "").replace(/\/index$/, "").replace(/\\/g, "/");
      routes.push({
        path: routePath || "/",
        file: relative(projectDir, page),
      });
    }

    // API routes in pages/api/
    const apiDir = join(pagesDir, "api");
    if (existsSync(apiDir)) {
      const apiFiles = await glob("**/*.{ts,tsx,js,jsx}", {
        cwd: apiDir,
        absolute: true,
      });
      for (const apiFile of apiFiles) {
        const relPath = relative(apiDir, apiFile);
        const routePath =
          "/api/" + relPath.replace(/\.\w+$/, "").replace(/\/index$/, "").replace(/\\/g, "/");
        apiEndpoints.push({
          path: routePath,
          method: "ALL",
          file: relative(projectDir, apiFile),
        });
      }
    }
  }
}

async function detectExpressRoutes(
  projectDir: string,
  apiEndpoints: RouteInfo[]
): Promise<void> {
  const files = await glob("**/*.{ts,js,mjs}", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  });

  for (const file of files) {
    const content = await readFile(file, "utf-8");

    // Match router.get/post/put/delete/patch and app.get/post/put/delete/patch
    const routeRegex =
      /(?:router|app|server)\.(get|post|put|delete|patch|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2];

      // Skip middleware-style .use() without specific paths
      if (method === "USE" && (path === "/" || !path.startsWith("/"))) continue;

      apiEndpoints.push({
        path,
        method,
        file: relative(projectDir, file),
      });
    }
  }
}

async function detectDjangoRoutes(
  projectDir: string,
  apiEndpoints: RouteInfo[]
): Promise<void> {
  const urlFiles = await glob("**/urls.py", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/venv/**", "**/.venv/**"],
  });

  for (const file of urlFiles) {
    const content = await readFile(file, "utf-8");

    // Match path() calls
    const pathRegex = /path\s*\(\s*['"]([^'"]*)['"]\s*,\s*(\w[\w.]*)/g;
    let match;
    while ((match = pathRegex.exec(content)) !== null) {
      apiEndpoints.push({
        path: "/" + match[1],
        handler: match[2],
        file: relative(projectDir, file),
      });
    }
  }
}

async function detectPythonAPIRoutes(
  projectDir: string,
  framework: string,
  apiEndpoints: RouteInfo[]
): Promise<void> {
  const files = await glob("**/*.py", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/venv/**", "**/.venv/**", "**/__pycache__/**"],
  });

  for (const file of files) {
    const content = await readFile(file, "utf-8");

    // Flask/FastAPI decorators: @app.get("/path"), @router.post("/path"), etc.
    const decoratorRegex =
      /@(?:app|router|api)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = decoratorRegex.exec(content)) !== null) {
      apiEndpoints.push({
        path: match[2],
        method: match[1].toUpperCase(),
        file: relative(projectDir, file),
      });
    }

    // Flask route decorator: @app.route("/path", methods=["GET", "POST"])
    const flaskRouteRegex =
      /@(?:app|blueprint)\.route\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)/g;
    while ((match = flaskRouteRegex.exec(content)) !== null) {
      const path = match[1];
      const methods = match[2]
        ? match[2].split(",").map((m) => m.trim().replace(/['"]/g, ""))
        : ["GET"];
      for (const method of methods) {
        apiEndpoints.push({
          path,
          method,
          file: relative(projectDir, file),
        });
      }
    }
  }
}

async function detectAspNetRoutes(
  projectDir: string,
  apiEndpoints: RouteInfo[]
): Promise<void> {
  const files = await glob("**/*.cs", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/bin/**", "**/obj/**"],
  });

  for (const file of files) {
    const content = await readFile(file, "utf-8");

    // [HttpGet], [HttpPost], etc. with optional route template
    const attrRegex =
      /\[(Http(?:Get|Post|Put|Delete|Patch))(?:\s*\(\s*"([^"]*)")?\s*\]/g;
    let match;
    while ((match = attrRegex.exec(content)) !== null) {
      const method = match[1].replace("Http", "").toUpperCase();
      const path = match[2] || "";

      apiEndpoints.push({
        path: path || "(from controller route)",
        method,
        file: relative(projectDir, file),
      });
    }

    // [Route("api/[controller]")]
    const routeAttrRegex = /\[Route\s*\(\s*"([^"]+)"\s*\)\]/g;
    while ((match = routeAttrRegex.exec(content)) !== null) {
      apiEndpoints.push({
        path: "/" + match[1],
        file: relative(projectDir, file),
      });
    }
  }
}

async function detectSPARoutes(
  projectDir: string,
  framework: string,
  routes: RouteInfo[]
): Promise<void> {
  const files = await glob("**/*.{ts,tsx,js,jsx}", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  });

  for (const file of files) {
    const content = await readFile(file, "utf-8");

    // React Router: <Route path="/..." />
    const reactRouteRegex = /<Route\s+[^>]*path\s*=\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = reactRouteRegex.exec(content)) !== null) {
      routes.push({
        path: match[1],
        file: relative(projectDir, file),
      });
    }

    // Vue Router: { path: '/...' }
    if (framework === "vue") {
      const vueRouteRegex = /path\s*:\s*['"]([^'"]+)['"]/g;
      while ((match = vueRouteRegex.exec(content)) !== null) {
        if (match[1].startsWith("/")) {
          routes.push({
            path: match[1],
            file: relative(projectDir, file),
          });
        }
      }
    }
  }
}

function extractHTTPMethods(content: string): string[] {
  const methods: string[] = [];
  const methodNames = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

  for (const method of methodNames) {
    // export async function GET/POST/etc.
    const regex = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${method}\\b`
    );
    if (regex.test(content)) {
      methods.push(method);
    }
  }

  return methods.length > 0 ? methods : ["GET"];
}
