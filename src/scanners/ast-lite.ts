// Athena - AST-Lite Parser
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { glob } from "glob";
import type {
  ASTLiteResult,
  FunctionInfo,
  ClassInfo,
  ExportInfo,
  ComponentInfo,
} from "../types.js";

const JS_TS_EXTENSIONS = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
const PYTHON_EXTENSIONS = "**/*.py";
const CSHARP_EXTENSIONS = "**/*.cs";

const IGNORE_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "bin",
  "obj",
  ".git",
  "coverage",
  ".turbo",
];

export async function parseSourceFiles(
  projectDir: string,
  language: string
): Promise<ASTLiteResult> {
  const result: ASTLiteResult = {
    functions: [],
    classes: [],
    exports: [],
    components: [],
  };

  let patterns: string[];
  switch (language) {
    case "typescript":
    case "javascript":
      patterns = [JS_TS_EXTENSIONS];
      break;
    case "python":
      patterns = [PYTHON_EXTENSIONS];
      break;
    case "csharp":
      patterns = [CSHARP_EXTENSIONS];
      break;
    default:
      patterns = [JS_TS_EXTENSIONS, PYTHON_EXTENSIONS, CSHARP_EXTENSIONS];
  }

  const files: string[] = [];
  for (const pattern of patterns) {
    const matched = await glob(pattern, {
      cwd: projectDir,
      absolute: true,
      ignore: IGNORE_DIRS.map((d) => `**/${d}/**`),
    });
    files.push(...matched);
  }

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const relPath = relative(projectDir, file);

    if (file.match(/\.(ts|tsx|js|jsx|mjs|cjs)$/)) {
      parseJSTS(content, relPath, result);
    } else if (file.endsWith(".py")) {
      parsePython(content, relPath, result);
    } else if (file.endsWith(".cs")) {
      parseCSharp(content, relPath, result);
    }
  }

  return result;
}

function parseJSTS(content: string, file: string, result: ASTLiteResult): void {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Named function declarations
    const funcMatch = trimmed.match(
      /^(export\s+)?(export\s+default\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/
    );
    if (funcMatch) {
      const exported = !!(funcMatch[1] || funcMatch[2]);
      const isAsync = !!funcMatch[3];
      const name = funcMatch[4];
      const params = funcMatch[5]
        ? funcMatch[5].split(",").map((p) => p.trim().split(/[:\s=]/)[0].trim()).filter(Boolean)
        : [];

      result.functions.push({ name, file, exported, async: isAsync, params });

      // Detect React components (PascalCase + returns JSX)
      if (
        name[0] === name[0].toUpperCase() &&
        file.match(/\.(tsx|jsx)$/)
      ) {
        result.components.push({
          name,
          file,
          type: "function",
          exported,
          props: params,
        });
      }

      if (funcMatch[2]) {
        result.exports.push({ name, file, type: "default" });
      } else if (funcMatch[1]) {
        result.exports.push({ name, file, type: "named" });
      }
      continue;
    }

    // Arrow function / const declarations
    const arrowMatch = trimmed.match(
      /^(export\s+)?(export\s+default\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s+)?\(?([^)]*)\)?\s*=>/
    );
    if (arrowMatch) {
      const exported = !!(arrowMatch[1] || arrowMatch[2]);
      const name = arrowMatch[3];
      const isAsync = !!arrowMatch[4];
      const params = arrowMatch[5]
        ? arrowMatch[5].split(",").map((p) => p.trim().split(/[:\s=]/)[0].trim()).filter(Boolean)
        : [];

      result.functions.push({ name, file, exported, async: isAsync, params });

      if (
        name[0] === name[0].toUpperCase() &&
        file.match(/\.(tsx|jsx)$/)
      ) {
        result.components.push({
          name,
          file,
          type: "arrow",
          exported,
          props: params,
        });
      }

      if (arrowMatch[2]) {
        result.exports.push({ name, file, type: "default" });
      } else if (arrowMatch[1]) {
        result.exports.push({ name, file, type: "named" });
      }
      continue;
    }

    // Class declarations
    const classMatch = trimmed.match(
      /^(export\s+)?(export\s+default\s+)?class\s+(\w+)/
    );
    if (classMatch) {
      const exported = !!(classMatch[1] || classMatch[2]);
      const name = classMatch[3];
      const methods = extractClassMethods(content, trimmed);

      result.classes.push({ name, file, exported, methods });

      if (classMatch[2]) {
        result.exports.push({ name, file, type: "default" });
      } else if (classMatch[1]) {
        result.exports.push({ name, file, type: "named" });
      }
      continue;
    }

    // Export statements
    const exportDefaultMatch = trimmed.match(/^export\s+default\s+(\w+)/);
    if (exportDefaultMatch && !trimmed.includes("function") && !trimmed.includes("class")) {
      result.exports.push({ name: exportDefaultMatch[1], file, type: "default" });
      continue;
    }

    const namedExportMatch = trimmed.match(/^export\s*\{([^}]+)\}/);
    if (namedExportMatch) {
      const names = namedExportMatch[1].split(",").map((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      });
      for (const name of names) {
        if (name) result.exports.push({ name, file, type: "named" });
      }
    }
  }
}

function extractClassMethods(content: string, classLine: string): string[] {
  const methods: string[] = [];
  const startIdx = content.indexOf(classLine);
  if (startIdx === -1) return methods;

  const afterClass = content.slice(startIdx);
  const methodRegex = /^\s+(async\s+)?(\w+)\s*\(/gm;
  let match;
  let braceCount = 0;
  let started = false;

  for (const char of afterClass) {
    if (char === "{") {
      braceCount++;
      started = true;
    }
    if (char === "}") braceCount--;
    if (started && braceCount === 0) break;
  }

  const classBody = afterClass.slice(0, afterClass.length);
  while ((match = methodRegex.exec(classBody)) !== null) {
    const name = match[2];
    if (name !== "constructor" && name !== "if" && name !== "for" && name !== "while") {
      methods.push(name);
    }
  }

  return [...new Set(methods)];
}

function parsePython(content: string, file: string, result: ASTLiteResult): void {
  const lines = content.split("\n");

  let currentClass: ClassInfo | null = null;

  for (const line of lines) {
    // Class definitions
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      if (currentClass) {
        result.classes.push(currentClass);
      }
      currentClass = {
        name: classMatch[1],
        file,
        exported: true,
        methods: [],
      };
      continue;
    }

    // Methods inside a class
    if (currentClass && line.match(/^\s+def\s+/)) {
      const methodMatch = line.match(/^\s+def\s+(\w+)\s*\(/);
      if (methodMatch && methodMatch[1] !== "__init__") {
        currentClass.methods.push(methodMatch[1]);
      }
      continue;
    }

    // Top-level function definitions
    const funcMatch = line.match(
      /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)/
    );
    if (funcMatch) {
      if (currentClass) {
        result.classes.push(currentClass);
        currentClass = null;
      }

      const isAsync = !!funcMatch[1];
      const name = funcMatch[2];
      const params = funcMatch[3]
        ? funcMatch[3]
            .split(",")
            .map((p) => p.trim().split(/[:\s=]/)[0].trim())
            .filter((p) => p && p !== "self" && p !== "cls")
        : [];

      const exported = !name.startsWith("_");
      result.functions.push({ name, file, exported, async: isAsync, params });
    }
  }

  if (currentClass) {
    result.classes.push(currentClass);
  }
}

function parseCSharp(content: string, file: string, result: ASTLiteResult): void {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Class declarations
    const classMatch = trimmed.match(
      /(?:public|private|internal|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:partial\s+)?class\s+(\w+)/
    );
    if (classMatch) {
      const name = classMatch[1];
      const exported = trimmed.startsWith("public");
      const methods = extractCSharpMethods(content);
      result.classes.push({ name, file, exported, methods });
      continue;
    }

    // Top-level methods (inside classes, but we capture them)
    const methodMatch = trimmed.match(
      /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:Task\s*<?\s*\w*\s*>?\s+|\w+\s+)(\w+)\s*\(([^)]*)\)/
    );
    if (methodMatch && !trimmed.includes("class ")) {
      const name = methodMatch[1];
      const isAsync = trimmed.includes("async ");
      const params = methodMatch[2]
        ? methodMatch[2].split(",").map((p) => {
            const parts = p.trim().split(/\s+/);
            return parts[parts.length - 1];
          }).filter(Boolean)
        : [];
      const exported = trimmed.startsWith("public");

      result.functions.push({ name, file, exported, async: isAsync, params });
    }
  }
}

function extractCSharpMethods(content: string): string[] {
  const methods: string[] = [];
  const regex =
    /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:\w+\s+)(\w+)\s*\(/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    methods.push(match[1]);
  }
  return [...new Set(methods)];
}
