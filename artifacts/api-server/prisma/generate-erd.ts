// BUG-003 / TC-012: generates the project ERD (docs/erd.mmd, Mermaid
// erDiagram) from schema.prisma via the generated Prisma client, so the
// diagram always matches the real schema.
//
//   pnpm erd          regenerate docs/erd.mmd
//   pnpm erd:check    exit 1 if docs/erd.mmd is stale (used by CI)
//   --file <path>     use another output file (tests)
//
// Run `pnpm prisma:generate` first so the client reflects schema.prisma.
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'path';

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
type Field = Model['fields'][number];

const SCHEMA_PATH = path.resolve(__dirname, 'schema.prisma');
const DEFAULT_ERD_PATH = path.resolve(__dirname, '../../../docs/erd.mmd');

const normalize = (text: string) => text.replace(/\r\n/g, '\n');

function attributeKeys(model: Model, field: Field, foreignKeys: Set<string>): string {
  const keys: string[] = [];
  if (field.isId || model.primaryKey?.fields.includes(field.name)) keys.push('PK');
  if (foreignKeys.has(field.name)) keys.push('FK');
  if (field.isUnique) keys.push('UK');
  return keys.join(', ');
}

function entity(model: Model): string {
  const foreignKeys = new Set(
    model.fields.flatMap((field) => (field.relationFromFields ?? []) as string[]),
  );
  const lines = model.fields
    .filter((field) => field.kind !== 'object')
    .map((field) => {
      const type = field.isList ? `${field.type}_list` : field.type;
      const keys = attributeKeys(model, field, foreignKeys);
      const comment = field.isRequired ? '' : ' "optional"';
      return `    ${type} ${field.name}${keys ? ` ${keys}` : ''}${comment}`;
    });
  return [`  ${model.name} {`, ...lines, '  }'].join('\n');
}

// One line per foreign key, drawn from the referenced (parent) model to the
// model that holds the key: parent ||--o{ child : "field".
function relationships(models: Model[]): string[] {
  const byName = new Map(models.map((model) => [model.name, model]));
  const lines: string[] = [];
  for (const child of models) {
    for (const field of child.fields) {
      if (field.kind !== 'object' || !field.relationFromFields?.length) continue;
      const parent = byName.get(field.type)!;
      const back = parent.fields.find(
        (candidate) => candidate.relationName === field.relationName && candidate !== field,
      );
      const parentSide = field.isRequired ? '||' : '|o';
      const childSide = back?.isList ? 'o{' : 'o|';
      lines.push(`  ${parent.name} ${parentSide}--${childSide} ${child.name} : "${field.name}"`);
    }
  }
  return lines.sort();
}

export function generateErd(): string {
  const models = [...Prisma.dmmf.datamodel.models].sort((a, b) => a.name.localeCompare(b.name));
  const schemaHash = createHash('sha256')
    .update(normalize(readFileSync(SCHEMA_PATH, 'utf8')))
    .digest('hex')
    .slice(0, 12);
  const relations = relationships(models);
  return [
    '%% QueueLess entity-relationship diagram (ERD)',
    '%% Generated from artifacts/api-server/prisma/schema.prisma - do not edit by hand.',
    '%% Regenerate: pnpm --filter @workspace/api-server erd   (CI fails when this file is stale)',
    '%% View: paste into https://mermaid.live or any Mermaid viewer.',
    '%% Review: the approved pull request that changes this file is the review record.',
    `%% ${models.length} tables, ${relations.length} relationships, schema sha256 ${schemaHash}`,
    '%% Keys: PK primary key, FK foreign key, UK unique. Relationship labels are the Prisma relation fields.',
    'erDiagram',
    ...relations,
    '',
    ...models.map(entity),
    '',
  ].join('\n');
}

if (require.main === module) {
  const fileFlag = process.argv.indexOf('--file');
  const ERD_PATH = fileFlag > -1 ? path.resolve(process.argv[fileFlag + 1]) : DEFAULT_ERD_PATH;
  const generated = generateErd();
  if (process.argv.includes('--check')) {
    const current = existsSync(ERD_PATH) ? normalize(readFileSync(ERD_PATH, 'utf8')) : '';
    if (current !== generated) {
      console.error('docs/erd.mmd is out of date with schema.prisma. Run: pnpm --filter @workspace/api-server erd');
      process.exit(1);
    }
    console.log('docs/erd.mmd is up to date with schema.prisma');
  } else {
    writeFileSync(ERD_PATH, generated);
    console.log(`Wrote ${path.relative(process.cwd(), ERD_PATH)}`);
  }
}
