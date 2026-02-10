# API Documentation

## Table of Contents

- [API Documentation](#api-documentation)
  - [Overview](#overview)
  - [CLI Commands](#cli-commands)
    - [Command Reference](#command-reference)
  - [Programmatic API](#programmatic-api)
    - [Core Functions](#core-functions)
    - [Documentation Generation](#documentation-generation)
    - [AI Client](#ai-client)
    - [Utility Functions](#utility-functions)
    - [Changelog Functions](#changelog-functions)
    - [Diagram Functions](#diagram-functions)
    - [Screenshot Functions](#screenshot-functions)
  - [Data Structures](#data-structures)
    - [Manifest (inferred)](#manifest-inferred)
    - [FunctionDefinition (inferred)](#functiondefinition-inferred)
    - [ClassDefinition (inferred)](#classdefinition-inferred)
  - [Error Handling](#error-handling)
  - [Rate Limiting](#rate-limiting)
  - [Environment Variables](#environment-variables)
  - [Configuration File](#configuration-file)
  - [Related Documentation](#related-documentation)

## Overview

**Athena** is a documentation generation tool and does not expose a traditional REST API or web service API. Instead, it provides a **Command-Line Interface (CLI)** and a **Programmatic Node.js API** for generating project documentation.

**Base Usage:**
- CLI: `athena <command> [options]`
- Programmatic: `import { scanProject, DocGenerator } from 'athena'`

**Authentication:** Not applicable (local tool)

---

## CLI Commands

The CLI is the primary interface for Athena. Commands are invoked via the command line.

### Command Reference

| Command | Description | Status |
|---------|-------------|--------|
| `scan` | Scan project and generate documentation | (inferred) |
| `generate` | Generate documentation from manifest | (inferred) |
| `freshness` | Check documentation freshness | (inferred) |
| `changelog` | Generate changelog from git history | (inferred) |
| `diagrams` | Generate architecture diagrams | (inferred) |

---

## Programmatic API

### Core Functions

#### `scanProject(projectDir: string): Promise<Manifest>`

Scans a project directory and returns a manifest of detected functions, classes, and structure.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectDir` | string | Yes | Absolute or relative path to project root |

**Returns:** `Promise<Manifest>` — Project manifest object

**Example:**

```typescript
import { scanProject } from 'athena';

const manifest = await scanProject('./my-project');
console.log(manifest.functions);
console.log(manifest.classes);
```

---

#### `loadConfig(projectDir: string): Promise<Config>`

Loads Athena configuration from the project directory.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectDir` | string | Yes | Path to project root |

**Returns:** `Promise<Config>` — Configuration object

**Example:**

```typescript
import { loadConfig } from 'athena';

const config = await loadConfig('./my-project');
console.log(config);
```

---

#### `getConfigPath(projectDir: string): string`

Returns the expected configuration file path for a project.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectDir` | string | Yes | Path to project root |

**Returns:** `string` — Absolute path to config file

**Example:**

```typescript
import { getConfigPath } from 'athena';

const configPath = getConfigPath('./my-project');
// Returns: '/absolute/path/to/my-project/.athenarc' (inferred)
```

---

#### `hasConfig(projectDir: string): boolean`

Checks if a project has an Athena configuration file.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectDir` | string | Yes | Path to project root |

**Returns:** `boolean` — True if config exists

**Example:**

```typescript
import { hasConfig } from 'athena';

if (hasConfig('./my-project')) {
  console.log('Configuration found');
}
```

---

### Documentation Generation

#### `DocGenerator` Class

Generates documentation using AI (Claude) from project manifests.

**Constructor:**

```typescript
new DocGenerator(config?: GeneratorConfig)
```

**Methods:**

##### `generate(manifest: Manifest, type: DocType): Promise<string>`

Generates documentation of specified type from manifest.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `manifest` | Manifest | Yes | Project manifest from scanner |
| `type` | DocType | Yes | Type of documentation to generate |

**Returns:** `Promise<string>` — Generated markdown documentation

**Example:**

```typescript
import { DocGenerator, scanProject } from 'athena';

const manifest = await scanProject('./my-project');
const generator = new DocGenerator();

const readme = await generator.generate(manifest, 'README');
const api = await generator.generate(manifest, 'API');
```

---

##### `join(sections: string[]): string`

Joins multiple documentation sections into a single document.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sections` | string[] | Yes | Array of markdown sections |

**Returns:** `string` — Combined markdown document

**Example:**

```typescript
const generator = new DocGenerator();
const combined = generator.join([overview, apiDocs, examples]);
```

---

### AI Client

#### `ClaudeClient` Class

Interfaces with Anthropic's Claude API for AI-powered documentation generation.

**Constructor:**

```typescript
new ClaudeClient(apiKey: string, model?: string)
```

**Methods:**

##### `getModelName(): string`

Returns the currently configured Claude model name.

**Returns:** `string` — Model identifier (e.g., 'claude-3-5-sonnet-20241022')

**Example:**

```typescript
import { ClaudeClient } from 'athena';

const client = new ClaudeClient(process.env.ANTHROPIC_API_KEY);
console.log(client.getModelName());
```

---

##### `generate(prompt: string, context?: object): Promise<string>`

Generates content using Claude API based on prompt and context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prompt` | string | Yes | Generation prompt/instructions |
| `context` | object | No | Additional context for generation |

**Returns:** `Promise<string>` — Generated content

**Example:**

```typescript
const client = new ClaudeClient(process.env.ANTHROPIC_API_KEY);
const documentation = await client.generate(
  'Generate API documentation',
  { manifest, endpoints }
);
```

---

### Utility Functions

#### `parseMarkdownSections(markdown: string): Section[]`

Parses markdown into structured sections based on headers.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `markdown` | string | Yes | Markdown content to parse |

**Returns:** `Section[]` — Array of section objects

---

#### `slugify(text: string): string`

Converts text to URL-safe slug format.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `text` | string | Yes | Text to slugify |

**Returns:** `string` — Slugified text

**Example:**

```typescript
import { slugify } from 'athena';

const slug = slugify('API Documentation'); // 'api-documentation'
```

---

#### `generateTableOfContents(sections: Section[]): string`

Generates markdown table of contents from sections.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sections` | Section[] | Yes | Parsed markdown sections |

**Returns:** `string` — Markdown TOC

---

#### `buildSourceSummary(manifest: Manifest): string`

Creates a summary of source code structure from manifest.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `manifest` | Manifest | Yes | Project manifest |

**Returns:** `string` — Formatted summary text

---

#### `buildCrossReferences(docs: Document[]): Map<string, Reference[]>`

Builds cross-reference links between documentation sections.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `docs` | Document[] | Yes | Array of documentation objects |

**Returns:** `Map<string, Reference[]>` — Cross-reference mapping

---

### Changelog Functions

#### `getTags(projectDir: string): Promise<Tag[]>`

Retrieves git tags from project repository.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectDir` | string | Yes | Path to git repository |

**Returns:** `Promise<Tag[]>` — Array of git tags

---

#### `getGitHubUrl(projectDir: string): Promise<string | null>`

Extracts GitHub repository URL from git remote.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectDir` | string | Yes | Path to git repository |

**Returns:** `Promise<string | null>` — GitHub URL or null if not found

---

### Diagram Functions

#### `DiagramGenerator` Class

Generates architecture diagrams using Mermaid.

**Methods:**

##### `generate(manifest: Manifest, type: DiagramType): Promise<string>`

Generates diagram definition from manifest.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `manifest` | Manifest | Yes | Project manifest |
| `type` | DiagramType | Yes | Diagram type (flowchart, sequence, etc.) |

**Returns:** `Promise<string>` — Mermaid diagram definition

---

##### `switch(type: DiagramType): void` (inferred)

Switches the diagram generation mode.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `type` | DiagramType | Yes | New diagram type |

---

#### `isMermaidCliAvailable(): Promise<boolean>`

Checks if Mermaid CLI is installed and available.

**Returns:** `Promise<boolean>` — True if Mermaid CLI is available

**Example:**

```typescript
import { isMermaidCliAvailable } from 'athena';

if (await isMermaidCliAvailable()) {
  console.log('Mermaid diagrams can be rendered');
}
```

---

### Screenshot Functions

#### `stopDevServer(server: DevServer): void` (inferred)

Stops a development server instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `server` | DevServer | Yes | Server instance to stop |

---

#### `filterUsefulResults(results: Result[]): Result[]` (inferred)

Filters screenshot results to keep only useful captures.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `results` | Result[] | Yes | Array of screenshot results |

**Returns:** `Result[]` — Filtered results

---

## Data Structures

### Manifest (inferred)

```typescript
interface Manifest {
  project: string;
  framework: string;
  language: string;
  scanned: string;
  functions: FunctionDefinition[];
  classes: ClassDefinition[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}
```

### FunctionDefinition (inferred)

```typescript
interface FunctionDefinition {
  name: string;
  signature: string;
  location: string;
  async?: boolean;
}
```

### ClassDefinition (inferred)

```typescript
interface ClassDefinition {
  name: string;
  methods: string[];
  location: string;
}
```

---

## Error Handling

Athena functions throw standard Node.js errors. Common error scenarios:

| Error Type | Cause | Example |
|------------|-------|---------|
| `ENOENT` | Project directory not found | Invalid path passed to `scanProject()` |
| `EACCES` | Permission denied | Cannot read config file |
| `APIError` | Claude API error | Invalid API key or rate limit exceeded |
| `ValidationError` | Invalid configuration | Malformed `.athenarc` file |

**Example Error Handling:**

```typescript
try {
  const manifest = await scanProject('./my-project');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Project directory not found');
  } else if (error.name === 'APIError') {
    console.error('Claude API error:', error.message);
  } else {
    throw error;
  }
}
```

---

## Rate Limiting

**Claude API:** Subject to Anthropic's rate limits based on your API tier. The `ClaudeClient` does not implement automatic retry logic (inferred). Consider implementing exponential backoff in your application code.

**Recommended Practice:**

```typescript
async function generateWithRetry(client, prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.generate(prompt);
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2 ** i * 1000));
        continue;
      }
      throw error;
    }
  }
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for documentation generation |

---

## Configuration File

Athena looks for a configuration file in the project root (inferred: `.athenarc`, `.athena.json`, or `athena.config.js`).

**Example Configuration:**

```json
{
  "exclude": ["node_modules", "dist", "coverage"],
  "include": ["src/**/*.ts"],
  "output": "docs",
  "model": "claude-3-5-sonnet-20241022"
}
```
---

## Related Documentation

- [Readme](README.md)
- [Architecture](ARCHITECTURE.md)
- [Deployment](DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
