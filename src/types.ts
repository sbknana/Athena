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
