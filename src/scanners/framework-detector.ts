// Athena - Framework Detector
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Framework, Language } from "../types.js";

interface DetectionResult {
  framework: Framework;
  language: Language;
  packageJson?: Record<string, unknown>;
}

export async function detectFramework(
  projectDir: string
): Promise<DetectionResult> {
  const packageJsonPath = join(projectDir, "package.json");
  const pyprojectPath = join(projectDir, "pyproject.toml");
  const requirementsPath = join(projectDir, "requirements.txt");
  const setupPyPath = join(projectDir, "setup.py");
  const csprojFiles = await findFiles(projectDir, "*.csproj");
  const goModPath = join(projectDir, "go.mod");
  const cargoTomlPath = join(projectDir, "Cargo.toml");
  const gemfilePath = join(projectDir, "Gemfile");
  const composerPath = join(projectDir, "composer.json");
  const pomPath = join(projectDir, "pom.xml");
  const buildGradlePath = join(projectDir, "build.gradle");

  // Node.js / JavaScript / TypeScript projects
  if (existsSync(packageJsonPath)) {
    const raw = await readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };

    const hasTS =
      "typescript" in deps ||
      existsSync(join(projectDir, "tsconfig.json"));
    const language: Language = hasTS ? "typescript" : "javascript";

    // Next.js
    if ("next" in deps) {
      return { framework: "nextjs", language, packageJson: pkg };
    }
    // NestJS
    if ("@nestjs/core" in deps) {
      return { framework: "nestjs", language, packageJson: pkg };
    }
    // Fastify
    if ("fastify" in deps) {
      return { framework: "fastify", language, packageJson: pkg };
    }
    // Express
    if ("express" in deps) {
      return { framework: "express", language, packageJson: pkg };
    }
    // Vue
    if ("vue" in deps) {
      return { framework: "vue", language, packageJson: pkg };
    }
    // Angular
    if ("@angular/core" in deps) {
      return { framework: "angular", language, packageJson: pkg };
    }
    // React (check after Next.js)
    if ("react" in deps) {
      return { framework: "react", language, packageJson: pkg };
    }

    return { framework: "unknown", language, packageJson: pkg };
  }

  // Python projects
  if (
    existsSync(pyprojectPath) ||
    existsSync(requirementsPath) ||
    existsSync(setupPyPath)
  ) {
    const framework = await detectPythonFramework(projectDir);
    return { framework, language: "python" };
  }

  // .NET / C# projects
  if (csprojFiles.length > 0) {
    const framework = await detectDotnetFramework(csprojFiles);
    return { framework, language: "csharp" };
  }

  // Java projects
  if (existsSync(pomPath) || existsSync(buildGradlePath)) {
    return { framework: "spring", language: "java" };
  }

  // Go projects
  if (existsSync(goModPath)) {
    return { framework: "go" as Framework, language: "go" };
  }

  // Rust projects
  if (existsSync(cargoTomlPath)) {
    return { framework: "rust" as Framework, language: "rust" };
  }

  // Ruby projects
  if (existsSync(gemfilePath)) {
    const gemfileContent = await readFile(gemfilePath, "utf-8");
    if (gemfileContent.includes("rails")) {
      return { framework: "rails", language: "ruby" };
    }
    return { framework: "unknown", language: "ruby" };
  }

  // PHP projects
  if (existsSync(composerPath)) {
    const raw = await readFile(composerPath, "utf-8");
    const composer = JSON.parse(raw) as Record<string, unknown>;
    const require = composer.require as Record<string, string> | undefined;
    if (require && "laravel/framework" in require) {
      return { framework: "laravel", language: "php" };
    }
    return { framework: "unknown", language: "php" };
  }

  return { framework: "unknown", language: "unknown" };
}

async function detectPythonFramework(projectDir: string): Promise<Framework> {
  const filesToCheck = [
    join(projectDir, "pyproject.toml"),
    join(projectDir, "requirements.txt"),
    join(projectDir, "setup.py"),
  ];

  for (const filePath of filesToCheck) {
    if (!existsSync(filePath)) continue;
    const content = await readFile(filePath, "utf-8");

    if (content.includes("django")) return "django";
    if (content.includes("fastapi")) return "fastapi";
    if (content.includes("flask")) return "flask";
  }

  return "unknown";
}

async function detectDotnetFramework(csprojFiles: string[]): Promise<Framework> {
  for (const csproj of csprojFiles) {
    const content = await readFile(csproj, "utf-8");
    if (
      content.includes("Microsoft.AspNetCore") ||
      content.includes("Microsoft.NET.Sdk.Web")
    ) {
      return "aspnet";
    }
  }
  return "dotnet";
}

async function findFiles(dir: string, pattern: string): Promise<string[]> {
  const { glob } = await import("glob");
  return glob(pattern, { cwd: dir, absolute: true });
}
