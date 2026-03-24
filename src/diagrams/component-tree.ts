// Athena - Component Tree Diagram Generator
// Copyright 2026, Forgeborn

import { readFile } from "node:fs/promises";
import { relative, basename, dirname } from "node:path";
import { glob } from "glob";
import type { ProjectManifest } from "../types.js";

interface ComponentNode {
  name: string;
  file: string;
  children: string[];
}

/**
 * Generate a Mermaid graph showing React/Next.js component hierarchy.
 */
export async function generateComponentTreeDiagram(
  projectDir: string,
  manifest: ProjectManifest
): Promise<string> {
  const components = manifest.components;
  if (components.length === 0) return "";

  // Build a map of component names to their files
  const componentMap = new Map<string, string>();
  for (const comp of components) {
    componentMap.set(comp.name, comp.file);
  }

  // Parse JSX/TSX files for component usage
  const nodes: ComponentNode[] = [];
  const componentNames = new Set(components.map((c) => c.name));

  const ignores = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
  ];

  const files = await glob("**/*.{tsx,jsx}", {
    cwd: projectDir,
    absolute: true,
    ignore: ignores,
  });

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const relFile = relative(projectDir, file);

    // Find which components are used in this file
    const usedComponents: string[] = [];
    for (const name of componentNames) {
      // Match <ComponentName or <ComponentName> usage
      const regex = new RegExp(`<${name}[\\s/>]`, "g");
      if (regex.test(content)) {
        usedComponents.push(name);
      }
    }

    // Find which component this file defines
    const definedComponent = components.find((c) => c.file === relFile);
    if (definedComponent) {
      // Remove self-reference
      const children = usedComponents.filter((c) => c !== definedComponent.name);
      nodes.push({
        name: definedComponent.name,
        file: relFile,
        children,
      });
    }
  }

  if (nodes.length === 0) return "";

  // Build tree from root down
  const lines: string[] = ["graph TD"];

  // Find root components (not used as children by others)
  const allChildren = new Set<string>();
  for (const node of nodes) {
    for (const child of node.children) {
      allChildren.add(child);
    }
  }

  const roots = nodes.filter((n) => !allChildren.has(n.name));
  const nonRoots = nodes.filter((n) => allChildren.has(n.name));

  // Add all component nodes with styling
  const added = new Set<string>();
  const addedEdges = new Set<string>();

  function addNode(name: string): void {
    if (added.has(name)) return;
    added.add(name);
    const id = sanitizeId(name);
    const comp = components.find((c) => c.name === name);
    const label = comp?.props?.length ? `${name}(${comp.props.join(", ")})` : name;
    lines.push(`  ${id}["${escapeLabel(label)}"]`);
  }

  function addEdges(node: ComponentNode, depth: number): void {
    if (depth > 4) return; // Prevent infinite recursion

    addNode(node.name);

    for (const child of node.children) {
      const edgeKey = `${node.name}->${child}`;
      if (addedEdges.has(edgeKey)) continue;
      addedEdges.add(edgeKey);

      addNode(child);
      lines.push(`  ${sanitizeId(node.name)} --> ${sanitizeId(child)}`);

      const childNode = nodes.find((n) => n.name === child);
      if (childNode) {
        addEdges(childNode, depth + 1);
      }
    }
  }

  // Start from roots
  const displayNodes = roots.length > 0 ? roots : nodes.slice(0, 5);
  for (const root of displayNodes.slice(0, 8)) {
    addEdges(root, 0);
  }

  // Add orphan components that have children but weren't reached
  for (const node of nonRoots) {
    if (!added.has(node.name) && node.children.length > 0) {
      addEdges(node, 0);
    }
  }

  // Style root nodes differently
  if (roots.length > 0) {
    const rootIds = roots.filter((r) => added.has(r.name)).map((r) => sanitizeId(r.name));
    if (rootIds.length > 0) {
      lines.push(`  classDef root fill:#f96,stroke:#333,stroke-width:2px`);
      lines.push(`  class ${rootIds.join(",")} root`);
    }
  }

  // Cap total nodes at 30 to keep diagram readable
  if (added.size > 30) {
    return lines.slice(0, 65).join("\n") + "\n  overflow[\"... more components\"]";
  }

  return lines.join("\n");
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_") || "node";
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/[<>]/g, "");
}
