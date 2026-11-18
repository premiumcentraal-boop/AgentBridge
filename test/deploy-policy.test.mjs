import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

test('GitHub Pages publication requires explicit workflow dispatch', () => {
  const triggers = workflow.match(/^on:\s*\n((?:[ \t]+[^\n]*\n)*)/m);
  assert.ok(triggers, 'workflow must declare its triggers');
  assert.match(triggers[1], /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(triggers[1], /^  (?:push|pull_request|schedule|workflow_run):/m);
});

test('preview deploy retains static build and audit before publishing', () => {
  assert.match(workflow, /npm run build:site/);
  assert.match(workflow, /npm run test:site/);
  assert.match(workflow, /actions\/deploy-pages@/);
});

test('hourly quality installs root and web dependencies before running CI', () => {
  const hourly = readFileSync(new URL('../.github/workflows/hourly-quality.yml', import.meta.url), 'utf8');
  const rootInstall = hourly.indexOf('run: npm ci --ignore-scripts --no-audit --no-fund');
  const webInstall = hourly.indexOf('run: npm --prefix web ci --ignore-scripts --no-audit --no-fund');
  const validation = hourly.indexOf('run: npm run ci');
  assert.ok(rootInstall >= 0, 'root dependencies must be installed for shared phone imports');
  assert.ok(webInstall > rootInstall, 'web dependencies must follow root installation');
  assert.ok(validation > webInstall, 'CI must run after both dependency installs');
});
