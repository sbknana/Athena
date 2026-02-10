// Athena - Database Schema ER Diagram Generator
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "glob";

interface SchemaModel {
  name: string;
  fields: SchemaField[];
}

interface SchemaField {
  name: string;
  type: string;
  relation?: string;
  isId?: boolean;
  isOptional?: boolean;
}

/**
 * Generate a Mermaid ER diagram from Prisma schema or SQL files.
 */
export async function generateDBSchemaDiagram(
  projectDir: string
): Promise<string> {
  // Try Prisma first
  const prismaModels = await parsePrismaSchema(projectDir);
  if (prismaModels.length > 0) {
    return buildERDiagram(prismaModels);
  }

  // Try SQL files
  const sqlModels = await parseSQLFiles(projectDir);
  if (sqlModels.length > 0) {
    return buildERDiagram(sqlModels);
  }

  // Try TypeORM/Sequelize entity files
  const ormModels = await parseORMEntities(projectDir);
  if (ormModels.length > 0) {
    return buildERDiagram(ormModels);
  }

  return "";
}

async function parsePrismaSchema(
  projectDir: string
): Promise<SchemaModel[]> {
  const prismaFiles = await glob("**/schema.prisma", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });

  if (prismaFiles.length === 0) return [];

  const content = await readFile(prismaFiles[0], "utf-8");
  const models: SchemaModel[] = [];

  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: SchemaField[] = [];

    const fieldLines = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));

    for (const line of fieldLines) {
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\?)?(?:\s+.*)?$/);
      if (fieldMatch) {
        const field: SchemaField = {
          name: fieldMatch[1],
          type: fieldMatch[2],
          isOptional: !!fieldMatch[3],
        };

        // Check for @id
        if (line.includes("@id")) {
          field.isId = true;
        }

        // Check for @relation
        const relationMatch = line.match(/@relation\s*\([^)]*\)/);
        if (relationMatch) {
          field.relation = fieldMatch[2];
        }

        // Check if the type references another model
        if (fieldMatch[2][0] === fieldMatch[2][0].toUpperCase() && !isPrismaScalar(fieldMatch[2])) {
          field.relation = fieldMatch[2];
        }

        fields.push(field);
      }
    }

    models.push({ name, fields });
  }

  return models;
}

async function parseSQLFiles(
  projectDir: string
): Promise<SchemaModel[]> {
  const sqlFiles = await glob("**/*.sql", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/migrations/**"],
  });

  if (sqlFiles.length === 0) return [];

  const models: SchemaModel[] = [];

  for (const file of sqlFiles.slice(0, 10)) {
    const content = await readFile(file, "utf-8");

    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([^;]+)\)/gi;
    let match;

    while ((match = createTableRegex.exec(content)) !== null) {
      const name = match[1];
      const body = match[2];
      const fields: SchemaField[] = [];

      const lines = body.split(",").map((l) => l.trim()).filter((l) => l && !l.toUpperCase().startsWith("CONSTRAINT") && !l.toUpperCase().startsWith("PRIMARY KEY") && !l.toUpperCase().startsWith("FOREIGN KEY") && !l.toUpperCase().startsWith("INDEX") && !l.toUpperCase().startsWith("UNIQUE"));

      for (const line of lines) {
        const colMatch = line.match(/^["`]?(\w+)["`]?\s+(\w+(?:\([^)]*\))?)/i);
        if (colMatch) {
          const field: SchemaField = {
            name: colMatch[1],
            type: colMatch[2].toUpperCase(),
            isId: /PRIMARY\s+KEY/i.test(line),
          };

          // Detect foreign key references
          const refMatch = line.match(/REFERENCES\s+["`]?(\w+)["`]?/i);
          if (refMatch) {
            field.relation = refMatch[1];
          }

          fields.push(field);
        }
      }

      // Check for foreign key constraints in the body
      const fkRegex = /FOREIGN\s+KEY\s*\(["`]?(\w+)["`]?\)\s*REFERENCES\s+["`]?(\w+)["`]?/gi;
      let fkMatch: RegExpExecArray | null;
      while ((fkMatch = fkRegex.exec(body)) !== null) {
        const fkField = fields.find((f) => f.name === fkMatch![1]);
        if (fkField) {
          fkField.relation = fkMatch![2];
        }
      }

      if (fields.length > 0) {
        models.push({ name, fields });
      }
    }
  }

  return models;
}

async function parseORMEntities(
  projectDir: string
): Promise<SchemaModel[]> {
  const entityFiles = await glob("**/*{entity,model}.{ts,js}", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**"],
  });

  if (entityFiles.length === 0) return [];

  const models: SchemaModel[] = [];

  for (const file of entityFiles) {
    const content = await readFile(file, "utf-8");

    // Look for @Entity() decorated classes
    const classMatch = content.match(/(?:@Entity|@Table|@Model).*\n.*class\s+(\w+)/);
    if (!classMatch) continue;

    const name = classMatch[1];
    const fields: SchemaField[] = [];

    // Extract @Column() decorated properties
    const columnRegex = /@(?:Column|PrimaryGeneratedColumn|PrimaryColumn|ManyToOne|OneToMany|ManyToMany|OneToOne)\s*\([^)]*\)\s*\n?\s*(\w+)\s*[?!]?\s*:\s*(\w+)/g;
    let match;

    while ((match = columnRegex.exec(content)) !== null) {
      const field: SchemaField = {
        name: match[1],
        type: match[2],
      };

      if (content.includes(`@PrimaryGeneratedColumn`) || content.includes(`@PrimaryColumn`)) {
        if (match[0].includes("Primary")) {
          field.isId = true;
        }
      }

      if (match[0].includes("ManyToOne") || match[0].includes("OneToMany") || match[0].includes("ManyToMany") || match[0].includes("OneToOne")) {
        field.relation = match[2];
      }

      fields.push(field);
    }

    if (fields.length > 0) {
      models.push({ name, fields });
    }
  }

  return models;
}

function buildERDiagram(models: SchemaModel[]): string {
  if (models.length === 0) return "";

  const lines: string[] = ["erDiagram"];
  const relationships: string[] = [];

  for (const model of models.slice(0, 15)) {
    lines.push(`  ${sanitizeId(model.name)} {`);

    for (const field of model.fields.slice(0, 15)) {
      const typeStr = mapFieldType(field.type);
      const pk = field.isId ? "PK" : "";
      const fk = field.relation ? "FK" : "";
      const constraint = pk || fk;
      lines.push(`    ${typeStr} ${sanitizeFieldName(field.name)}${constraint ? ` ${constraint}` : ""}`);

      if (field.relation) {
        const relTarget = sanitizeId(field.relation);
        // Only add if target model exists
        if (models.some((m) => m.name === field.relation)) {
          relationships.push(`  ${sanitizeId(model.name)} }o--|| ${relTarget} : "${sanitizeFieldName(field.name)}"`);
        }
      }
    }

    if (model.fields.length > 15) {
      lines.push(`    string ___more_fields___`);
    }

    lines.push(`  }`);
  }

  // Add unique relationships
  const uniqueRels = [...new Set(relationships)];
  lines.push(...uniqueRels);

  return lines.join("\n");
}

function isPrismaScalar(type: string): boolean {
  const scalars = [
    "String", "Int", "Float", "Boolean", "DateTime",
    "BigInt", "Decimal", "Json", "Bytes",
  ];
  return scalars.includes(type);
}

function mapFieldType(type: string): string {
  const typeMap: Record<string, string> = {
    String: "string",
    Int: "int",
    Float: "float",
    Boolean: "boolean",
    DateTime: "datetime",
    BigInt: "bigint",
    Decimal: "decimal",
    Json: "json",
    Bytes: "bytes",
    INTEGER: "int",
    VARCHAR: "string",
    TEXT: "string",
    BOOLEAN: "boolean",
    TIMESTAMP: "datetime",
    DATE: "datetime",
    REAL: "float",
    BLOB: "bytes",
    number: "int",
    string: "string",
    boolean: "boolean",
    Date: "datetime",
  };

  // Handle types with params like VARCHAR(255)
  const baseType = type.replace(/\(.*\)/, "").toUpperCase();
  return typeMap[type] || typeMap[baseType] || "string";
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_") || "entity";
}

function sanitizeFieldName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_") || "field";
}
