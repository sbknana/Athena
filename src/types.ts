// Athena - Project Scanner Types
// Copyright 2026, TheForge, LLC

export type Framework =
  | "nextjs"
  | "react"
  | "vue"
  | "angular"
  | "express"
  | "fastify"
  | "nestjs"
  | "django"
  | "flask"
  | "fastapi"
  | "dotnet"
  | "aspnet"
  | "spring"
  | "rails"
  | "laravel"
  | "go"
  | "rust"
  | "unknown";

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "csharp"
  | "java"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "unknown";

export interface RouteInfo {
  path: string;
  method?: string;
  handler?: string;
  file: string;
}

export interface ComponentInfo {
  name: string;
  file: string;
  type: "function" | "class" | "arrow";
  exported: boolean;
  props?: string[];
}

export interface FunctionInfo {
  name: string;
  file: string;
  exported: boolean;
  async: boolean;
  params: string[];
}

export interface ClassInfo {
  name: string;
  file: string;
  exported: boolean;
  methods: string[];
}

export interface ExportInfo {
  name: string;
  file: string;
  type: "default" | "named";
}

export interface ASTLiteResult {
  functions: FunctionInfo[];
  classes: ClassInfo[];
  exports: ExportInfo[];
  components: ComponentInfo[];
}

export interface ContextFiles {
  claudeMd?: string;
  readmeMd?: string;
  packageJson?: Record<string, unknown>;
  pyprojectToml?: string;
}

export interface ProjectManifest {
  name: string;
  framework: Framework;
  language: Language;
  routes: RouteInfo[];
  components: ComponentInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  exports: ExportInfo[];
  apiEndpoints: RouteInfo[];
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  context: {
    hasClaudeMd: boolean;
    hasReadme: boolean;
    claudeMdSummary?: string;
    readmeSummary?: string;
  };
  scannedAt: string;
  athenaVersion: string;
}

// --- Documentation Generator Types ---

export type DocType =
  | "readme"
  | "architecture"
  | "api"
  | "deployment"
  | "contributing";

export type ModelTier = "speed" | "quality";

export interface ScreenshotInfo {
  path: string;
  route?: string;
  description?: string;
  viewport?: string;
  theme?: string;
}

export interface ScreenshotManifest {
  screenshots: ScreenshotInfo[];
  capturedAt: string;
}

export interface DocGeneratorConfig {
  model: ModelTier;
  apiKey?: string;
  outputDir: string;
  projectDir: string;
  docs: DocType[];
  screenshotManifest?: ScreenshotManifest;
  diffMode: boolean;
}

export interface GeneratedDoc {
  type: DocType;
  filename: string;
  content: string;
  sections: DocSection[];
}

export interface DocSection {
  heading: string;
  level: number;
  content: string;
  anchor: string;
}

export interface DiffResult {
  filename: string;
  hasChanges: boolean;
  addedLines: number;
  removedLines: number;
  patch: string;
}

export interface DocGenerationResult {
  docs: GeneratedDoc[];
  diffs: DiffResult[];
  model: string;
  generatedAt: string;
}

// --- Screenshot Engine Types ---

export type ViewportName = "mobile" | "tablet" | "desktop";

export type ThemeName = "light" | "dark";

export interface ViewportConfig {
  name: ViewportName;
  width: number;
  height: number;
}

export interface AuthConfig {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  username: string;
  password: string;
  successIndicator?: string;
}

export interface InteractiveAction {
  type: "click" | "hover" | "fill" | "select";
  selector: string;
  value?: string;
  description: string;
  waitAfterMs?: number;
}

export interface RouteScreenshotConfig {
  route: string;
  description?: string;
  skipAuth?: boolean;
  actions?: InteractiveAction[];
  waitForSelector?: string;
  category?: "page" | "login" | "admin" | "empty-state";
}

export interface ScreenshotEngineConfig {
  projectDir: string;
  outputDir: string;
  manifestPath?: string;
  baseUrl?: string;
  devServerCommand?: string;
  devServerPort?: number;
  viewports: ViewportConfig[];
  themes: ThemeName[];
  auth?: AuthConfig;
  routes?: RouteScreenshotConfig[];
  timeout?: number;
  fullPage?: boolean;
}

export interface ScreenshotResult {
  route: string;
  viewport: ViewportName;
  theme: ThemeName;
  filePath: string;
  fullPagePath?: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface ScreenshotEngineResult {
  manifest: ScreenshotManifest;
  results: ScreenshotResult[];
  totalRoutes: number;
  totalScreenshots: number;
  failures: number;
  duration: number;
}

// --- Athena Config Types ---

export interface AthenaConfig {
  projectName?: string;
  description?: string;
  devServer?: {
    command?: string;
    port?: number;
    baseUrl?: string;
  };
  auth?: AuthConfig;
  excludedRoutes?: string[];
  docs?: {
    types?: DocType[];
    model?: ModelTier;
    outputDir?: string;
    diffMode?: boolean;
    customSections?: Record<string, string>;
  };
  screenshots?: {
    outputDir?: string;
    baseUrl?: string;
    devServerCommand?: string;
    devServerPort?: number;
    viewports?: ViewportName[];
    themes?: ThemeName[];
    routes?: RouteScreenshotConfig[];
    timeout?: number;
    fullPage?: boolean;
  };
  freshness?: {
    include?: string[];
    exclude?: string[];
    trackingFile?: string;
  };
  schedule?: {
    cron?: string;
    timezone?: string;
  };
}

// --- Freshness Tracking Types ---

export interface FileHash {
  path: string;
  hash: string;
  size: number;
  mtime: string;
}

export interface FreshnessRecord {
  generatedAt: string;
  athenaVersion: string;
  projectDir: string;
  sourceHashes: FileHash[];
  configHash?: string;
  docsGenerated: string[];
}

export interface FreshnessCheckResult {
  isStale: boolean;
  changedFiles: string[];
  newFiles: string[];
  deletedFiles: string[];
  lastGenerated?: string;
  reason: string;
}

// --- Changelog Generator Types ---

export type CommitCategory =
  | "feature"
  | "fix"
  | "refactor"
  | "docs"
  | "chore"
  | "test"
  | "style"
  | "perf"
  | "ci"
  | "breaking";

export interface ParsedCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  category: CommitCategory;
  scope?: string;
  breaking: boolean;
  prNumber?: number;
  issueNumbers: number[];
}

export interface VersionSection {
  version: string;
  date: string;
  tag?: string;
  commits: ParsedCommit[];
  features: ParsedCommit[];
  fixes: ParsedCommit[];
  refactors: ParsedCommit[];
  docs: ParsedCommit[];
  chores: ParsedCommit[];
  tests: ParsedCommit[];
  styles: ParsedCommit[];
  perfs: ParsedCommit[];
  ci: ParsedCommit[];
  breaking: ParsedCommit[];
}

export interface ChangelogConfig {
  projectDir: string;
  outputDir?: string;
  includeHistory?: boolean;
  githubUrl?: string;
  fromTag?: string;
  toRef?: string;
}

export interface ChangelogResult {
  changelogPath: string;
  historyPath?: string;
  versions: VersionSection[];
  totalCommits: number;
  githubUrl?: string;
}

// --- CLI Screenshot Types ---

export interface CLICommandInfo {
  name: string;
  command: string;
  source: "package.json:scripts" | "package.json:bin" | "athena.config.json" | "detected";
  description?: string;
}

export interface CLIRunConfig {
  command: string;
  args: string[];
  description: string;
  stdin?: string;
  timeout?: number;
}

export interface CLIRunResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  timedOut: boolean;
  duration: number;
}

export interface CLIScreenshotResult {
  command: string;
  args: string[];
  filePath: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface CLIScreenshotConfig {
  projectDir: string;
  outputDir?: string;
  commands?: CLIRunConfig[];
  timeout?: number;
  theme?: "dark" | "light";
  fontFamily?: string;
  fontSize?: number;
  width?: number;
  padding?: number;
}

export interface CLIScreenshotEngineResult {
  results: CLIScreenshotResult[];
  totalCommands: number;
  totalScreenshots: number;
  failures: number;
  duration: number;
}

// --- Diagram Generator Types ---

export type DiagramType =
  | "dependency"
  | "imports"
  | "db-schema"
  | "api-flow"
  | "component-tree"
  | "file-structure"
  | "data-flow";

export interface DiagramGeneratorConfig {
  projectDir: string;
  outputDir: string;
  types?: DiagramType[];
  render?: boolean;
  format?: "png" | "svg" | "both";
  markdown?: boolean;
}

export interface DiagramInfo {
  type: DiagramType;
  name: string;
  mermaidCode: string;
  mmdPath: string;
  renderResults: Array<{
    name: string;
    format: string;
    outputPath: string;
    success: boolean;
    error?: string;
  }>;
}

export interface DiagramResult {
  diagrams: DiagramInfo[];
  errors: Array<{ type: DiagramType; error: string }>;
  outputDir: string;
  markdownPath?: string;
}
