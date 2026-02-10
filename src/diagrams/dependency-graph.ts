// Athena - Dependency Graph Generator
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { glob } from "glob";
import type { ProjectManifest } from "../types.js";

interface ImportEdge {
  from: string;
  to: string;
  type: "local" | "package";
}

/**
 * Generate a Mermaid flowchart showing package dependencies from package.json.
 */
export function generatePackageDependencyGraph(
  manifest: ProjectManifest
): string {
  const deps = Object.keys(manifest.dependencies || {});
  const devDeps = Object.keys(manifest.devDependencies || {});

  if (deps.length === 0 && devDeps.length === 0) {
    return "";
  }

  const lines: string[] = ["graph LR"];
  const projectNode = sanitizeId(manifest.name || "project");
  lines.push(`  ${projectNode}["${escapeLabel(manifest.name || "Project")}"]`);

  // Group runtime deps
  if (deps.length > 0) {
    for (const dep of deps.slice(0, 20)) {
      const depId = sanitizeId(dep);
      lines.push(`  ${depId}["${escapeLabel(dep)}"]`);
      lines.push(`  ${projectNode} --> ${depId}`);
    }
    if (deps.length > 20) {
      lines.push(`  more_deps["... +${deps.length - 20} more"]`);
      lines.push(`  ${projectNode} --> more_deps`);
    }
  }

  // Group dev deps
  if (devDeps.length > 0) {
    for (const dep of devDeps.slice(0, 10)) {
      const depId = sanitizeId("dev_" + dep);
      lines.push(`  ${depId}["${escapeLabel(dep)}"]:::devDep`);
      lines.push(`  ${projectNode} -.-> ${depId}`);
    }
    if (devDeps.length > 10) {
      lines.push(`  more_devdeps["... +${devDeps.length - 10} more dev"]:::devDep`);
      lines.push(`  ${projectNode} -.-> more_devdeps`);
    }
  }

  lines.push(`  classDef devDep fill:#f9f,stroke:#333,stroke-dasharray: 5 5`);

  return lines.join("\n");
}

/**
 * Generate a Mermaid flowchart showing local import relationships between source files.
 */
export async function generateImportGraph(
  projectDir: string,
  manifest: ProjectManifest
): Promise<string> {
  const language = manifest.language;
  let patterns: string[];

  switch (language) {
    case "typescript":
    case "javascript":
      patterns = ["**/*.{ts,tsx,js,jsx,mjs}"];
      break;
    case "python":
      patterns = ["**/*.py"];
      break;
    default:
      patterns = ["**/*.{ts,tsx,js,jsx,mjs}"];
  }

  const ignores = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/__pycache__/**",
    "**/.venv/**",
    "**/venv/**",
    "**/coverage/**",
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matched = await glob(pattern, {
      cwd: projectDir,
      absolute: true,
      ignore: ignores,
    });
    files.push(...matched);
  }

  const edges: ImportEdge[] = [];
  const fileSet = new Set(files.map((f) => relative(projectDir, f)));

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const relFile = relative(projectDir, file);
    const localImports = extractLocalImports(content, language, relFile, projectDir);

    for (const imp of localImports) {
      edges.push({ from: relFile, to: imp, type: "local" });
    }
  }

  if (edges.length === 0) {
    return "";
  }

  // Collapse to directory-level for large projects
  const useDirectoryLevel = edges.length > 30;

  const lines: string[] = ["graph TD"];

  if (useDirectoryLevel) {
    const dirEdges = new Map<string, Set<string>>();
    for (const edge of edges) {
      const fromDir = dirname(edge.from) || ".";
      const toDir = dirname(edge.to) || ".";
      if (fromDir === toDir) continue;
      if (!dirEdges.has(fromDir)) dirEdges.set(fromDir, new Set());
      dirEdges.get(fromDir)!.add(toDir);
    }

    const allDirs = new Set<string>();
    for (const [from, tos] of dirEdges) {
      allDirs.add(from);
      for (const to of tos) allDirs.add(to);
    }

    for (const dir of allDirs) {
      const id = sanitizeId(dir);
      lines.push(`  ${id}["${escapeLabel(dir)}"]`);
    }

    for (const [from, tos] of dirEdges) {
      const fromId = sanitizeId(from);
      for (const to of tos) {
        lines.push(`  ${fromId} --> ${sanitizeId(to)}`);
      }
    }
  } else {
    // File-level graph
    const allFiles = new Set<string>();
    for (const edge of edges) {
      allFiles.add(edge.from);
      allFiles.add(edge.to);
    }

    for (const file of allFiles) {
      const id = sanitizeId(file);
      const label = basename(file);
      lines.push(`  ${id}["${escapeLabel(label)}"]`);
    }

    for (const edge of edges) {
      lines.push(`  ${sanitizeId(edge.from)} --> ${sanitizeId(edge.to)}`);
    }
  }

  return lines.join("\n");
}

function extractLocalImports(
  content: string,
  language: string,
  currentFile: string,
  projectDir: string
): string[] {
  const imports: string[] = [];

  if (language === "python") {
    const fromImportRegex = /^from\s+(\S+)\s+import/gm;
    let match;
    while ((match = fromImportRegex.exec(content)) !== null) {
      const mod = match[1];
      if (mod.startsWith(".")) {
        const resolved = resolveRelativePythonImport(mod, currentFile);
        if (resolved) imports.push(resolved);
      }
    }
  } else {
    // JS/TS imports
    const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const resolved = resolveRelativeJSImport(importPath, currentFile, projectDir);
      if (resolved) imports.push(resolved);
    }

    // Dynamic imports
    const dynamicRegex = /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    while ((match = dynamicRegex.exec(content)) !== null) {
      const importPath = match[1];
      const resolved = resolveRelativeJSImport(importPath, currentFile, projectDir);
      if (resolved) imports.push(resolved);
    }
  }

  return imports;
}

function resolveRelativeJSImport(
  importPath: string,
  currentFile: string,
  projectDir: string
): string | null {
  const dir = dirname(currentFile);
  const resolved = join(dir, importPath).replace(/\\/g, "/");

  // Try common extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ""];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    const fullPath = join(projectDir, candidate);
    if (existsSync(fullPath)) {
      return candidate;
    }
  }

  // Try index files
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    const candidate = join(resolved, "index" + ext).replace(/\\/g, "/");
    const fullPath = join(projectDir, candidate);
    if (existsSync(fullPath)) {
      return candidate;
    }
  }

  // Return as-is if we can't resolve
  return resolved.replace(/\.js$/, ".ts");
}

function resolveRelativePythonImport(
  mod: string,
  currentFile: string
): string | null {
  const dots = mod.match(/^(\.+)/);
  if (!dots) return null;

  const levels = dots[1].length;
  const parts = currentFile.split("/");

  if (levels > parts.length) return null;

  const base = parts.slice(0, parts.length - levels).join("/");
  const rest = mod.slice(levels).replace(/\./g, "/");

  return rest ? `${base}/${rest}.py` : `${base}/__init__.py`;
}

function sanitizeId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    || "node";
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/[<>]/g, "");
}
