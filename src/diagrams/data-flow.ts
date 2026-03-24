// Athena - Data Flow Diagram Generator
// Copyright 2026, Forgeborn

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { glob } from "glob";
import type { ProjectManifest, Framework } from "../types.js";

/**
 * Generate a Mermaid sequence diagram tracing data from UI -> API -> DB and back.
 */
export async function generateDataFlowDiagram(
  projectDir: string,
  manifest: ProjectManifest
): Promise<string> {
  const framework = manifest.framework;

  // Detect layers
  const layers = await detectArchitectureLayers(projectDir, framework);

  if (layers.length < 2) return "";

  const lines: string[] = ["sequenceDiagram"];

  // Add participants in order
  for (const layer of layers) {
    lines.push(`  participant ${layer.id} as ${layer.label}`);
  }

  // Build data flow paths based on framework
  const flows = buildDataFlows(layers, manifest);

  for (const flow of flows.slice(0, 4)) {
    lines.push("");
    lines.push(`  Note over ${layers[0].id},${layers[layers.length - 1].id}: ${flow.label}`);

    // Forward path
    for (let i = 0; i < flow.steps.length - 1; i++) {
      const from = flow.steps[i];
      const to = flow.steps[i + 1];
      lines.push(`  ${from.layerId}->>+${to.layerId}: ${from.action}`);
    }

    // Return path
    for (let i = flow.steps.length - 1; i > 0; i--) {
      const from = flow.steps[i];
      const to = flow.steps[i - 1];
      lines.push(`  ${from.layerId}-->>-${to.layerId}: ${from.returnAction || "response"}`);
    }
  }

  return lines.join("\n");
}

interface ArchitectureLayer {
  id: string;
  label: string;
  type: "ui" | "api" | "service" | "middleware" | "database" | "cache" | "external";
}

interface DataFlow {
  label: string;
  steps: DataFlowStep[];
}

interface DataFlowStep {
  layerId: string;
  action: string;
  returnAction?: string;
}

async function detectArchitectureLayers(
  projectDir: string,
  framework: Framework
): Promise<ArchitectureLayer[]> {
  const layers: ArchitectureLayer[] = [];

  const ignores = [
    "**/node_modules/**", "**/dist/**", "**/build/**",
    "**/.next/**", "**/venv/**", "**/.venv/**",
  ];

  // Detect UI layer
  const hasUI = await hasFiles(projectDir, [
    "**/*.{tsx,jsx}",
    "**/templates/**/*.html",
    "**/views/**/*.{ejs,pug,hbs}",
  ], ignores);

  if (hasUI) {
    layers.push({ id: "UI", label: "UI / Frontend", type: "ui" });
  }

  // Detect API layer
  const hasAPI = manifest_hasAPIs(framework) || await hasFiles(projectDir, [
    "**/routes/**/*.{ts,js,py}",
    "**/controllers/**/*.{ts,js,py,cs}",
    "**/api/**/*.{ts,js,py}",
    "**/views.py",
  ], ignores);

  if (hasAPI) {
    layers.push({ id: "API", label: "API / Routes", type: "api" });
  }

  // Detect service/business logic layer
  const hasService = await hasFiles(projectDir, [
    "**/services/**/*.{ts,js,py}",
    "**/service/**/*.{ts,js,py}",
    "**/lib/**/*.{ts,js,py}",
    "**/core/**/*.{ts,js,py}",
  ], ignores);

  if (hasService) {
    layers.push({ id: "Service", label: "Service / Logic", type: "service" });
  }

  // Detect database layer
  const hasDB = await hasFiles(projectDir, [
    "**/schema.prisma",
    "**/models/**/*.{ts,js,py}",
    "**/model/**/*.{ts,js,py}",
    "**/entities/**/*.{ts,js}",
    "**/*entity*.{ts,js}",
    "**/migrations/**",
    "**/*.sql",
  ], ignores);

  if (hasDB) {
    layers.push({ id: "DB", label: "Database", type: "database" });
  }

  // Detect cache layer
  const hasCacheFiles = await hasFiles(projectDir, [
    "**/cache/**/*.{ts,js,py}",
    "**/redis/**/*.{ts,js,py}",
  ], ignores);

  // Also check package.json for redis/cache deps
  let hasCacheDeps = false;
  try {
    const pkgContent = await readFile(`${projectDir}/package.json`, "utf-8");
    hasCacheDeps = /redis|ioredis|memcached/i.test(pkgContent);
  } catch {
    // no package.json
  }

  if (hasCacheFiles || hasCacheDeps) {
    // Insert cache before DB
    const dbIdx = layers.findIndex((l) => l.type === "database");
    if (dbIdx >= 0) {
      layers.splice(dbIdx, 0, { id: "Cache", label: "Cache", type: "cache" });
    } else {
      layers.push({ id: "Cache", label: "Cache", type: "cache" });
    }
  }

  // If we have too few layers, fill in reasonable defaults
  if (layers.length === 0) {
    layers.push({ id: "Client", label: "Client", type: "ui" });
    layers.push({ id: "Server", label: "Server", type: "api" });
  }

  return layers;
}

function manifest_hasAPIs(framework: Framework): boolean {
  const apiFrameworks: Framework[] = [
    "express", "fastify", "nestjs",
    "django", "flask", "fastapi",
    "aspnet", "spring", "rails", "laravel",
  ];
  return apiFrameworks.includes(framework);
}

async function hasFiles(
  projectDir: string,
  patterns: string[],
  ignores: string[]
): Promise<boolean> {
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: projectDir,
      absolute: true,
      ignore: ignores,
    });
    if (matches.length > 0) return true;
  }
  return false;
}

function buildDataFlows(
  layers: ArchitectureLayer[],
  manifest: ProjectManifest
): DataFlow[] {
  const flows: DataFlow[] = [];

  // Flow 1: Read operation (GET)
  const getEndpoints = manifest.apiEndpoints.filter(
    (e) => e.method === "GET" || !e.method
  );
  if (getEndpoints.length > 0) {
    const endpoint = getEndpoints[0];
    const steps: DataFlowStep[] = [];

    for (const layer of layers) {
      switch (layer.type) {
        case "ui":
          steps.push({
            layerId: layer.id,
            action: `fetch ${endpoint.path}`,
            returnAction: "render data",
          });
          break;
        case "api":
          steps.push({
            layerId: layer.id,
            action: `GET ${endpoint.path}`,
            returnAction: "JSON response",
          });
          break;
        case "service":
          steps.push({
            layerId: layer.id,
            action: "process request",
            returnAction: "processed data",
          });
          break;
        case "cache":
          steps.push({
            layerId: layer.id,
            action: "cache lookup",
            returnAction: "cached / miss",
          });
          break;
        case "database":
          steps.push({
            layerId: layer.id,
            action: "SELECT query",
            returnAction: "rows",
          });
          break;
      }
    }

    flows.push({ label: `Read: GET ${endpoint.path}`, steps });
  }

  // Flow 2: Write operation (POST/PUT)
  const writeEndpoints = manifest.apiEndpoints.filter(
    (e) => e.method === "POST" || e.method === "PUT"
  );
  if (writeEndpoints.length > 0) {
    const endpoint = writeEndpoints[0];
    const steps: DataFlowStep[] = [];

    for (const layer of layers) {
      switch (layer.type) {
        case "ui":
          steps.push({
            layerId: layer.id,
            action: "submit form data",
            returnAction: "show result",
          });
          break;
        case "api":
          steps.push({
            layerId: layer.id,
            action: `${endpoint.method} ${endpoint.path}`,
            returnAction: "success / error",
          });
          break;
        case "service":
          steps.push({
            layerId: layer.id,
            action: "validate & transform",
            returnAction: "result",
          });
          break;
        case "cache":
          steps.push({
            layerId: layer.id,
            action: "invalidate cache",
            returnAction: "ok",
          });
          break;
        case "database":
          steps.push({
            layerId: layer.id,
            action: "INSERT/UPDATE",
            returnAction: "affected rows",
          });
          break;
      }
    }

    flows.push({ label: `Write: ${endpoint.method} ${endpoint.path}`, steps });
  }

  // Flow 3: Delete operation
  const deleteEndpoints = manifest.apiEndpoints.filter(
    (e) => e.method === "DELETE"
  );
  if (deleteEndpoints.length > 0) {
    const endpoint = deleteEndpoints[0];
    const steps: DataFlowStep[] = [];

    for (const layer of layers) {
      switch (layer.type) {
        case "ui":
          steps.push({
            layerId: layer.id,
            action: "confirm & delete",
            returnAction: "update view",
          });
          break;
        case "api":
          steps.push({
            layerId: layer.id,
            action: `DELETE ${endpoint.path}`,
            returnAction: "204 No Content",
          });
          break;
        case "service":
          steps.push({
            layerId: layer.id,
            action: "authorize & delete",
            returnAction: "deleted",
          });
          break;
        case "database":
          steps.push({
            layerId: layer.id,
            action: "DELETE query",
            returnAction: "ok",
          });
          break;
      }
    }

    flows.push({ label: `Delete: DELETE ${endpoint.path}`, steps });
  }

  return flows;
}
