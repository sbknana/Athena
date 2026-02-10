// Athena - Project Scanner
// Copyright 2026, TheForge, LLC

import { basename } from "node:path";
import { detectFramework } from "./scanners/framework-detector.js";
import { parseSourceFiles } from "./scanners/ast-lite.js";
import { readContextFiles, summarizeText } from "./scanners/context-reader.js";
import { detectRoutes } from "./scanners/route-detector.js";
import type { ProjectManifest } from "./types.js";

const ATHENA_VERSION = "1.0.0";

export async function scanProject(projectDir: string): Promise<ProjectManifest> {
  console.log(`Scanning project: ${projectDir}`);

  // Step 1: Detect framework
  console.log("  Detecting framework...");
  const { framework, language, packageJson } = await detectFramework(projectDir);
  console.log(`  Framework: ${framework}, Language: ${language}`);

  // Step 2: Parse source files into AST-lite
  console.log("  Parsing source files...");
  const ast = await parseSourceFiles(projectDir, language);
  console.log(
    `  Found: ${ast.functions.length} functions, ${ast.classes.length} classes, ${ast.exports.length} exports, ${ast.components.length} components`
  );

  // Step 3: Read context files
  console.log("  Reading context files...");
  const context = await readContextFiles(projectDir);

  // Step 4: Detect routes
  console.log("  Detecting routes...");
  const { routes, apiEndpoints } = await detectRoutes(projectDir, framework);
  console.log(`  Found: ${routes.length} routes, ${apiEndpoints.length} API endpoints`);

  // Step 5: Extract scripts and dependencies from package.json
  const pkg = packageJson || context.packageJson;
  const scripts = (pkg?.scripts as Record<string, string>) || {};
  const dependencies = (pkg?.dependencies as Record<string, string>) || {};
  const devDependencies = (pkg?.devDependencies as Record<string, string>) || {};

  // Build manifest
  const manifest: ProjectManifest = {
    name: (pkg?.name as string) || basename(projectDir),
    framework,
    language,
    routes,
    components: ast.components,
    functions: ast.functions,
    classes: ast.classes,
    exports: ast.exports,
    apiEndpoints,
    scripts,
    dependencies,
    devDependencies,
    context: {
      hasClaudeMd: !!context.claudeMd,
      hasReadme: !!context.readmeMd,
      claudeMdSummary: context.claudeMd
        ? summarizeText(context.claudeMd)
        : undefined,
      readmeSummary: context.readmeMd
        ? summarizeText(context.readmeMd)
        : undefined,
    },
    scannedAt: new Date().toISOString(),
    athenaVersion: ATHENA_VERSION,
  };

  return manifest;
}
