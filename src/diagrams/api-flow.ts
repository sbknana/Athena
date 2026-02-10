// Athena - API Flow Sequence Diagram Generator
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { glob } from "glob";
import type { ProjectManifest, Framework } from "../types.js";

interface MiddlewareInfo {
  name: string;
  file: string;
}

/**
 * Generate a Mermaid sequence diagram showing API request flow:
 * Client -> Middleware -> Handler -> Database -> Response
 */
export async function generateAPIFlowDiagram(
  projectDir: string,
  manifest: ProjectManifest
): Promise<string> {
  const endpoints = manifest.apiEndpoints;
  if (endpoints.length === 0) return "";

  const middleware = await detectMiddleware(projectDir, manifest.framework);

  const lines: string[] = ["sequenceDiagram"];
  lines.push("  participant Client");

  if (middleware.length > 0) {
    lines.push("  participant Middleware");
  }

  lines.push("  participant Handler");

  const hasDB = await detectDatabase(projectDir);
  if (hasDB) {
    lines.push("  participant Database");
  }

  // Show up to 5 representative endpoints
  const sampleEndpoints = endpoints.slice(0, 5);

  for (const endpoint of sampleEndpoints) {
    const method = endpoint.method || "GET";
    const path = endpoint.path;
    const handler = endpoint.handler || basename(endpoint.file, ".ts").replace(".js", "");

    lines.push("");
    lines.push(`  Note over Client,${hasDB ? "Database" : "Handler"}: ${method} ${path}`);
    lines.push(`  Client->>+${middleware.length > 0 ? "Middleware" : "Handler"}: ${method} ${path}`);

    if (middleware.length > 0) {
      const mwNames = middleware.slice(0, 3).map((m) => m.name).join(", ");
      lines.push(`  Note right of Middleware: ${mwNames}`);
      lines.push(`  Middleware->>+Handler: ${handler}()`);
    }

    if (hasDB) {
      lines.push(`  Handler->>+Database: query`);
      lines.push(`  Database-->>-Handler: result`);
    }

    if (middleware.length > 0) {
      lines.push(`  Handler-->>-Middleware: response`);
      lines.push(`  Middleware-->>-Client: HTTP response`);
    } else {
      lines.push(`  Handler-->>-Client: HTTP response`);
    }
  }

  if (endpoints.length > 5) {
    lines.push("");
    lines.push(`  Note over Client,${hasDB ? "Database" : "Handler"}: ... +${endpoints.length - 5} more endpoints`);
  }

  return lines.join("\n");
}

async function detectMiddleware(
  projectDir: string,
  framework: Framework
): Promise<MiddlewareInfo[]> {
  const middleware: MiddlewareInfo[] = [];

  const ignores = ["**/node_modules/**", "**/dist/**", "**/build/**"];

  switch (framework) {
    case "express":
    case "fastify":
    case "nestjs": {
      const files = await glob("**/*.{ts,js}", {
        cwd: projectDir,
        absolute: true,
        ignore: ignores,
      });

      for (const file of files) {
        const content = await readFile(file, "utf-8");

        // Express: app.use(middleware)
        const useRegex = /\.use\s*\(\s*(\w+)/g;
        let match;
        while ((match = useRegex.exec(content)) !== null) {
          const name = match[1];
          if (!["express", "router", "app", "server", "path"].includes(name)) {
            middleware.push({ name, file: relative(projectDir, file) });
          }
        }
      }
      break;
    }

    case "nextjs": {
      // Next.js middleware.ts
      const mwFile = await glob("**/middleware.{ts,js}", {
        cwd: projectDir,
        absolute: true,
        ignore: ignores,
      });
      if (mwFile.length > 0) {
        middleware.push({ name: "middleware", file: relative(projectDir, mwFile[0]) });
      }
      break;
    }

    case "django":
    case "flask":
    case "fastapi": {
      const files = await glob("**/*.py", {
        cwd: projectDir,
        absolute: true,
        ignore: ["**/venv/**", "**/.venv/**", "**/__pycache__/**"],
      });

      for (const file of files) {
        const content = await readFile(file, "utf-8");

        // Django MIDDLEWARE setting
        if (content.includes("MIDDLEWARE")) {
          const mwRegex = /['"][\w.]+\.(\w+)['"]/g;
          let match;
          while ((match = mwRegex.exec(content)) !== null) {
            middleware.push({ name: match[1], file: relative(projectDir, file) });
          }
        }

        // FastAPI Middleware decorator
        const fastApiMw = content.match(/@app\.middleware\s*\(\s*['"](\w+)['"]\)/g);
        if (fastApiMw) {
          middleware.push({ name: "middleware", file: relative(projectDir, file) });
        }
      }
      break;
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return middleware.filter((m) => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });
}

async function detectDatabase(projectDir: string): Promise<boolean> {
  // Check package.json for DB-related deps
  const pkgPath = join(projectDir, "package.json");
  try {
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const dbPackages = [
      "prisma", "@prisma/client",
      "mongoose", "mongodb",
      "pg", "mysql2", "better-sqlite3", "sqlite3",
      "typeorm", "sequelize", "knex", "drizzle-orm",
      "redis", "ioredis",
    ];

    for (const dep of dbPackages) {
      if (dep in allDeps) return true;
    }
  } catch {
    // No package.json or invalid
  }

  // Check for Python DB indicators
  const pyFiles = await glob("**/requirements*.txt", {
    cwd: projectDir,
    absolute: true,
  });

  for (const file of pyFiles) {
    try {
      const content = await readFile(file, "utf-8");
      if (/sqlalchemy|django|psycopg|pymongo|redis/i.test(content)) {
        return true;
      }
    } catch {
      // skip
    }
  }

  // Check for Prisma schema
  const prismaFiles = await glob("**/schema.prisma", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });

  return prismaFiles.length > 0;
}
