'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('layout mobile limitado ao admin e ao breakpoint, sem esconder overflow da página', () => {
  const css = read('src/screens/admin/admin-responsive.css');
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /\.ops-shell\[data-admin="true"\]/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
  assert.match(css, /min-height: 44px/);
  assert.match(read('src/components/OpsShell.tsx'), /data-admin=\{ativo.startsWith\("admin-"\)/);
});

test('tabelas do admin têm rótulos para cada valor em cards mobile sem duplicar as ações', () => {
  const admin = read('src/screens/Admin.tsx');
  const tables = [...admin.matchAll(/<table\b[\s\S]*?<\/table>/g)];
  assert.ok(tables.length >= 4);
  for (const [table] of tables) {
    assert.match(table, /role="table"/);
    assert.match(table, /admin-data-table/);
    for (const [cell] of table.matchAll(/<td\b[^>]*>/g)) {
      assert.ok(cell.includes('data-label=') || cell.includes('colSpan='), cell);
    }
  }
});

test('modais administrativos recebem escopo responsivo sem alterar modais das outras telas', () => {
  assert.match(read('src/screens/Admin.tsx'), /className="admin-dialog"/);
  const css = read('src/screens/admin/admin-responsive.css');
  assert.match(css, /\.admin-dialog \.grid-cols-2 \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-product-name \{ white-space: normal/);
});
