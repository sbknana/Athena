// Athena - Diagrams Module Index
// Copyright 2026, TheForge, LLC

export { DiagramGenerator } from "./diagram-generator.js";
export {
  generatePackageDependencyGraph,
  generateImportGraph,
} from "./dependency-graph.js";
export { generateDBSchemaDiagram } from "./db-schema.js";
export { generateAPIFlowDiagram } from "./api-flow.js";
export { generateComponentTreeDiagram } from "./component-tree.js";
export { generateFileStructureDiagram } from "./file-structure.js";
export { generateDataFlowDiagram } from "./data-flow.js";
export {
  renderMermaid,
  renderMermaidBatch,
  isMermaidCliAvailable,
} from "./renderer.js";
export type { OutputFormat, RenderResult } from "./renderer.js";
