# Athena

## Table of Contents

- [Athena](#athena)
  - [Description](#description)
  - [Features](#features)
  - [Quick Start](#quick-start)
    - [Installation](#installation)
    - [Configure](#configure)
    - [Run](#run)
- [Scan and generate documentation](#scan-and-generate-documentation)
- [Check documentation freshness](#check-documentation-freshness)
- [Generate with screenshots](#generate-with-screenshots)
  - [Usage](#usage)
    - [Basic Documentation Generation](#basic-documentation-generation)
- [Generate all documentation](#generate-all-documentation)
- [Generate specific docs](#generate-specific-docs)
    - [Screenshot Capture](#screenshot-capture)
- [Capture screenshots with dev server](#capture-screenshots-with-dev-server)
- [Use existing server](#use-existing-server)
    - [Configuration](#configuration)
- [Check if project has config](#check-if-project-has-config)
- [Show current configuration](#show-current-configuration)
    - [Freshness Checking](#freshness-checking)
- [Check documentation freshness](#check-documentation-freshness)
- [Verbose output with details](#verbose-output-with-details)
  - [Tech Stack](#tech-stack)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
- [Required for AI generation](#required-for-ai-generation)
    - [Configuration File (athena.yml)](#configuration-file-athenayml)
  - [Contributing](#contributing)
  - [License](#license)
  - [Related Documentation](#related-documentation)

> Automated documentation generator powered by AI that keeps your project docs fresh and comprehensive

## Description

Athena is an intelligent documentation tool that automatically scans your codebase, analyzes its structure, and generates comprehensive documentation using Claude AI. It understands your project's architecture, features, and functionality to create high-quality README files, changelogs, and architectural diagrams without manual effort.

Built for modern TypeScript projects, Athena integrates seamlessly into your development workflow. It analyzes source code, captures screenshots, tracks git history, and produces documentation that stays in sync with your codebase. Whether you're starting a new project or maintaining an established one, Athena ensures your documentation is always accurate and up-to-date.

The tool goes beyond simple code documentation by generating visual aids like Mermaid diagrams, embedding screenshots, and creating interactive documentation that helps developers quickly understand and contribute to your project.

## Features

- **Automated Code Analysis** — Scans TypeScript projects to extract functions, classes, and dependencies
- **AI-Powered Content Generation** — Uses Claude AI to generate natural, comprehensive documentation
- **Screenshot Integration** — Captures and embeds application screenshots using Playwright
- **Diagram Generation** — Creates architectural diagrams with Mermaid
- **Changelog Automation** — Parses git history and tags to generate changelogs
- **Freshness Tracking** — Monitors documentation staleness and recommends updates
- **Configuration Management** — Flexible YAML-based project configuration
- **Cross-Reference Building** — Links related documentation sections automatically
- **Diff Analysis** — Shows documentation changes before committing updates

## Quick Start

### Installation

```bash
npm install -g athena
```

### Configure

Create an `athena.yml` file in your project root:

```yaml
project:
  name: my-project
  framework: react
  language: typescript

ai:
  provider: claude
  model: claude-3-5-sonnet-20241022

docs:
  output: ./docs
  readme: true
  changelog: true
```

### Run

```bash
# Scan and generate documentation
athena generate

# Check documentation freshness
athena check

# Generate with screenshots
athena generate --screenshots
```

## Usage

### Basic Documentation Generation

```bash
# Generate all documentation
athena generate

# Generate specific docs
athena generate --readme-only
athena generate --changelog-only
```

### Screenshot Capture

```bash
# Capture screenshots with dev server
athena screenshots --dev-command "npm start" --port 3000

# Use existing server
athena screenshots --url http://localhost:3000
```

### Configuration

```bash
# Check if project has config
athena config check

# Show current configuration
athena config show
```

### Freshness Checking

```bash
# Check documentation freshness
athena check

# Verbose output with details
athena check --verbose
```

## Tech Stack

- **Language**: TypeScript
- **AI Provider**: Anthropic Claude API (`@anthropic-ai/sdk`)
- **CLI Framework**: Commander.js
- **Screenshot Tool**: Playwright
- **Diagram Rendering**: Mermaid CLI
- **File Globbing**: glob
- **Diff Generation**: diff

## Configuration

### Environment Variables

```bash
# Required for AI generation
ANTHROPIC_API_KEY=your_api_key_here
```

### Configuration File (athena.yml)

```yaml
project:
  name: string          # Project name
  framework: string     # Framework (react, vue, next, etc.)
  language: string      # Primary language

ai:
  provider: string      # AI provider (claude)
  model: string         # Model name
  max_tokens: number    # Optional: token limit

docs:
  output: string        # Documentation output directory
  readme: boolean       # Generate README.md
  changelog: boolean    # Generate CHANGELOG.md
  diagrams: boolean     # Generate architecture diagrams

screenshots:
  enabled: boolean      # Enable screenshot capture
  paths: string[]       # Routes to capture
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to Athena.

## License

MIT
---

## Related Documentation

- [Architecture](ARCHITECTURE.md)
- [Api](API.md)
- [Deployment](DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
