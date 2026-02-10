# DEPLOYMENT.md

## Table of Contents

- [DEPLOYMENT.md](#deploymentmd)
  - [TL;DR](#tldr)
- [Clone and install](#clone-and-install)
- [Build and run](#build-and-run)
  - [Prerequisites](#prerequisites)
  - [Step-by-Step Setup](#step-by-step-setup)
    - [1. Clone the Repository](#1-clone-the-repository)
    - [2. Install Dependencies](#2-install-dependencies)
    - [3. Build the Project](#3-build-the-project)
    - [4. Set Up Environment Variables](#4-set-up-environment-variables)
    - [5. Verify Installation](#5-verify-installation)
    - [6. Run Your First Scan](#6-run-your-first-scan)
  - [Environment Variables](#environment-variables)
  - [Running in Production](#running-in-production)
    - [Option 1: Direct Node Execution](#option-1-direct-node-execution)
- [Build once](#build-once)
- [Run as a global command](#run-as-a-global-command)
- [Now use from anywhere](#now-use-from-anywhere)
    - [Option 2: PM2 (for long-running services)](#option-2-pm2-for-long-running-services)
- [Start as daemon (if running as a service)](#start-as-daemon-if-running-as-a-service)
- [Monitor](#monitor)
    - [Option 3: Systemd Service](#option-3-systemd-service)
    - [Option 4: Cron Job (scheduled scans)](#option-4-cron-job-scheduled-scans)
- [Edit crontab](#edit-crontab)
- [Add line (runs daily at 2 AM)](#add-line-runs-daily-at-2-am)
  - [Docker](#docker)
    - [Dockerfile](#dockerfile)
- [Install Playwright dependencies](#install-playwright-dependencies)
- [Copy package files](#copy-package-files)
- [Install dependencies](#install-dependencies)
- [Copy source and build](#copy-source-and-build)
- [Cleanup](#cleanup)
- [Runtime environment](#runtime-environment)
    - [Build and Run](#build-and-run)
- [Build image](#build-image)
- [Run with API key](#run-with-api-key)
- [Run with .env file](#run-with-env-file)
    - [Docker Compose](#docker-compose)
  - [Troubleshooting](#troubleshooting)
    - [Issue: `ANTHROPIC_API_KEY` not found](#issue-anthropic_api_key-not-found)
- [Or add to .env file](#or-add-to-env-file)
    - [Issue: TypeScript build fails](#issue-typescript-build-fails)
    - [Issue: Playwright browsers not installed](#issue-playwright-browsers-not-installed)
- [Or install all browsers](#or-install-all-browsers)
    - [Issue: Port already in use (for dev server)](#issue-port-already-in-use-for-dev-server)
- [Find and kill process using port](#find-and-kill-process-using-port)
- [Or use a different port (if configurable)](#or-use-a-different-port-if-configurable)
    - [Issue: Permission denied on `npm link`](#issue-permission-denied-on-npm-link)
- [Option 1: Use sudo (not recommended)](#option-1-use-sudo-not-recommended)
- [Option 2: Fix npm permissions](#option-2-fix-npm-permissions)
    - [Issue: Mermaid diagrams not generating](#issue-mermaid-diagrams-not-generating)
- [Install globally](#install-globally)
- [Verify installation](#verify-installation)
    - [Issue: Out of memory during build](#issue-out-of-memory-during-build)
- [Increase Node.js memory limit](#increase-nodejs-memory-limit)
    - [Issue: Git operations fail](#issue-git-operations-fail)
- [Initialize git in target project](#initialize-git-in-target-project)
- [Or skip git-dependent features (check CLI flags)](#or-skip-git-dependent-features-check-cli-flags)
    - [Debugging Tips](#debugging-tips)
- [Should output valid JSON](#should-output-valid-json)
  - [Related Documentation](#related-documentation)

## TL;DR

```bash
# Clone and install
git clone <your-repo-url> athena && cd athena
npm install

# Build and run
npm run build
npm start -- --help
```

## Prerequisites

| Tool | Version | Install Link |
|------|---------|-------------|
| Node.js | ≥18.0.0 | https://nodejs.org |
| npm | ≥9.0.0 | (comes with Node.js) |
| Git | Any recent | https://git-scm.com |
| Anthropic API Key | N/A | https://console.anthropic.com |

**Optional (for diagram generation):**
- Mermaid CLI: `npm install -g @mermaid-js/mermaid-cli`

**Optional (for screenshots):**
- Playwright browsers: Installed automatically during `npm install`

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url> athena
cd athena
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `@anthropic-ai/sdk` for Claude API integration
- `commander` for CLI parsing
- `diff` for change detection
- `glob` for file scanning
- `playwright` for screenshot generation

### 3. Build the Project

```bash
npm run build
```

This compiles TypeScript files from `src/` to `dist/`.

### 4. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-...
EOF
```

Or export directly:

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### 5. Verify Installation

```bash
npm start -- --version
npm start -- --help
```

You should see the Athena version and available commands.

### 6. Run Your First Scan

```bash
npm start -- scan /path/to/your/project
```

Or in development mode:

```bash
npm run dev -- scan /path/to/your/project
```

## Environment Variables

| Variable | Description | Example Value | Required? |
|----------|-------------|---------------|-----------|
| `ANTHROPIC_API_KEY` | Claude API key for documentation generation | `sk-ant-api03-xxxxx` | ✅ Yes (for generation) |
| `NODE_ENV` | Environment mode | `production` | ❌ No (defaults to development) |
| `DEBUG` | Enable debug logging | `athena:*` | ❌ No |

**Getting your API key:**
1. Go to https://console.anthropic.com
2. Navigate to API Keys section
3. Create a new key or copy existing one
4. Has billing access for production use

## Running in Production

### Option 1: Direct Node Execution

```bash
# Build once
npm run build

# Run as a global command
npm link

# Now use from anywhere
athena scan /path/to/project
athena generate --docs
```

### Option 2: PM2 (for long-running services)

```bash
npm install -g pm2

# Start as daemon (if running as a service)
pm2 start dist/cli.js --name athena -- scan /path/to/project --watch

# Monitor
pm2 logs athena
pm2 status
```

### Option 3: Systemd Service

Create `/etc/systemd/system/athena.service`:

```ini
[Unit]
Description=Athena Documentation Generator
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/athena
Environment="ANTHROPIC_API_KEY=sk-ant-api03-xxxxx"
ExecStart=/usr/bin/node /path/to/athena/dist/cli.js scan /path/to/target --watch
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable athena
sudo systemctl start athena
sudo systemctl status athena
```

### Option 4: Cron Job (scheduled scans)

```bash
# Edit crontab
crontab -e

# Add line (runs daily at 2 AM)
0 2 * * * cd /path/to/athena && /usr/bin/node dist/cli.js scan /path/to/project >> /var/log/athena.log 2>&1
```

## Docker

### Dockerfile

```dockerfile
FROM node:18-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm install -g typescript && \
    npm run build && \
    npm uninstall -g typescript

# Cleanup
RUN rm -rf src tsconfig.json

# Runtime environment
ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
```

### Build and Run

```bash
# Build image
docker build -t athena:latest .

# Run with API key
docker run --rm \
  -e ANTHROPIC_API_KEY="sk-ant-api03-xxxxx" \
  -v /path/to/target-project:/project \
  athena:latest scan /project

# Run with .env file
docker run --rm \
  --env-file .env \
  -v /path/to/target-project:/project \
  athena:latest scan /project --output /project/docs
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  athena:
    build: .
    image: athena:latest
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./target-project:/project
      - ./output:/output
    command: scan /project --output /output
```

Run:

```bash
docker-compose up
```

## Troubleshooting

### Issue: `ANTHROPIC_API_KEY` not found

**Symptom:**
```
Error: ANTHROPIC_API_KEY environment variable is required
```

**Fix:**
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxx"
# Or add to .env file
```

---

### Issue: TypeScript build fails

**Symptom:**
```
error TS2307: Cannot find module '@anthropic-ai/sdk'
```

**Fix:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

### Issue: Playwright browsers not installed

**Symptom:**
```
Error: browserType.launch: Executable doesn't exist at /path/to/chromium
```

**Fix:**
```bash
npx playwright install chromium
# Or install all browsers
npx playwright install
```

---

### Issue: Port already in use (for dev server)

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Fix:**
```bash
# Find and kill process using port
lsof -ti:3000 | xargs kill -9

# Or use a different port (if configurable)
PORT=3001 npm start
```

---

### Issue: Permission denied on `npm link`

**Symptom:**
```
EACCES: permission denied, symlink
```

**Fix:**
```bash
# Option 1: Use sudo (not recommended)
sudo npm link

# Option 2: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm link
```

---

### Issue: Mermaid diagrams not generating

**Symptom:**
```
Warning: Mermaid CLI not available, skipping diagram generation
```

**Fix:**
```bash
# Install globally
npm install -g @mermaid-js/mermaid-cli

# Verify installation
mmdc --version
```

---

### Issue: Out of memory during build

**Symptom:**
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Fix:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

### Issue: Git operations fail

**Symptom:**
```
Error: fatal: not a git repository
```

**Fix:**
This happens when scanning a non-git project. Either:
```bash
# Initialize git in target project
cd /path/to/project
git init

# Or skip git-dependent features (check CLI flags)
athena scan /path/to/project --no-git
```

---

### Debugging Tips

**Enable verbose logging:**
```bash
DEBUG=athena:* npm start -- scan /path/to/project
```

**Check TypeScript compilation:**
```bash
npx tsc --noEmit
```

**Validate config file:**
```bash
cat .athenarc.json | jq .
# Should output valid JSON
```

**Test API connectivity:**
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":1024,"messages":[{"role":"user","content":"Hi"}]}'
```
---

## Related Documentation

- [Readme](README.md)
- [Architecture](ARCHITECTURE.md)
