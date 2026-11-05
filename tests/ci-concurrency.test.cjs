'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const name of ['ci.yml', 'postgres-integration.yml']) {
  const source = fs.readFileSync(path.join(__dirname, '..', '.github/workflows', name), 'utf8');
  test(`${name}: valida PRs e main sem duplicar push de branches de trabalho`, () => {
    const triggers = source.match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1];
    assert.ok(triggers, 'gatilhos declarados');
    assert.match(triggers, /^  push:\n    branches: \[(?:'main'|main)\]$/m);
    assert.match(triggers, /^  pull_request:\n    branches: \[(?:'main'|main)\]$/m);
    assert.doesNotMatch(triggers, /paths(?:-ignore)?:/);
  });
  test(`${name}: cancela obsoletos isolando workflow e PR ou ref`, () => {
    assert.match(source, /^concurrency:\n  group: \$\{\{ github.workflow \}\}-\$\{\{ github.event.pull_request.number \|\| github.ref \}\}\n  cancel-in-progress: true$/m);
    assert.match(source, /^permissions:\n  contents: read$/m);
  });
}
