// BUG-003 / TC-012: docs/erd.mmd exists, covers every model and foreign key in
// schema.prisma, and the check fails when it goes stale.
// Needs the generated Prisma client: node --test test/bug-003-erd-regression.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Prisma } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const ERD_PATH = path.resolve(ROOT, '../../docs/erd.mmd');
const TSX_CLI = require.resolve('tsx/cli');

const runGenerator = (...args) =>
  spawnSync(process.execPath, [TSX_CLI, 'prisma/generate-erd.ts', ...args], { cwd: ROOT, encoding: 'utf8' });

const erd = () => readFileSync(ERD_PATH, 'utf8').replace(/\r\n/g, '\n');
const models = Prisma.dmmf.datamodel.models;

test('docs/erd.mmd is a Mermaid erDiagram generated from schema.prisma', () => {
  const text = erd();
  assert.match(text, /^erDiagram$/m);
  assert.match(text, /Generated from artifacts\/api-server\/prisma\/schema\.prisma/);
  assert.match(text, new RegExp(`%% ${models.length} tables, `));
});

test('every model is an entity with its primary key', () => {
  const text = erd();
  for (const model of models) {
    const block = text.match(new RegExp(`^  ${model.name} \\{\\n([\\s\\S]*?)\\n  \\}$`, 'm'));
    assert.ok(block, `missing entity ${model.name}`);
    const pk = model.fields.filter((f) => f.isId || model.primaryKey?.fields.includes(f.name));
    for (const field of pk) assert.match(block[1], new RegExp(` ${field.name} PK`), `${model.name}.${field.name} PK`);
  }
});

test('every foreign key is a relationship and an FK attribute', () => {
  const text = erd();
  let count = 0;
  for (const child of models) {
    for (const field of child.fields) {
      if (field.kind !== 'object' || !field.relationFromFields?.length) continue;
      count += 1;
      const line = new RegExp(`^  ${field.type} \\|[|o]--o[{|] ${child.name} : "${field.name}"$`, 'm');
      assert.match(text, line, `missing relationship ${field.type} -> ${child.name}.${field.name}`);
      for (const key of field.relationFromFields) {
        assert.match(text, new RegExp(`^    \\S+ ${key} [^\\n]*FK`, 'm'), `${child.name}.${key} FK`);
      }
    }
  }
  assert.ok(count > 0);
  assert.match(text, new RegExp(`, ${count} relationships, `));
});

test('cardinality: required one-to-many and optional one-to-one', () => {
  const text = erd();
  assert.match(text, /^  User \|\|--o\{ Order : "customer"$/m);
  assert.match(text, /^  Order \|\|--o\{ OrderItem : "order"$/m);
  // Order.groupOrderId is optional and unique: zero-or-one on both sides.
  assert.match(text, /^  GroupOrder \|o--o\| Order : "groupOrder"$/m);
});

test('erd:check passes on the committed file and fails when it is stale or missing', () => {
  const ok = runGenerator('--check');
  assert.equal(ok.status, 0, ok.stderr);

  const dir = mkdtempSync(path.join(tmpdir(), 'erd-'));
  const stale = path.join(dir, 'erd.mmd');
  writeFileSync(stale, erd().replace(/^  Order \{\n/m, '  Order {\n    String removedColumn\n'));
  const failed = runGenerator('--check', '--file', stale);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /out of date/);

  const missing = runGenerator('--check', '--file', path.join(dir, 'none.mmd'));
  assert.equal(missing.status, 1);

  const written = runGenerator('--file', stale);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(readFileSync(stale, 'utf8'), erd());
});
