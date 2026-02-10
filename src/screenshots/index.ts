// Athena - Screenshot Engine Exports
// Copyright 2026, TheForge, LLC

export {
  runScreenshotEngine,
  loadScreenshotConfig,
  VIEWPORTS,
  DEFAULT_VIEWPORTS,
  DEFAULT_THEMES,
} from "./screenshot-engine.js";

export { discoverRoutes } from "./route-discovery.js";

export {
  startDevServer,
  stopDevServer,
  detectDevCommand,
  type DevServerInfo,
} from "./dev-server.js";

export { captureScreenshots } from "./capturer.js";

export { loadAuthConfig, performLogin } from "./auth-handler.js";

export {
  buildManifest,
  writeManifest,
  loadManifest,
  type FullScreenshotManifest,
} from "./manifest.js";
