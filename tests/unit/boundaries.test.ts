import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, check } from '../package-fixture';

describe('source boundaries', () => {
  it.each([
    ['src/config/schema.ts', 'chrome.storage.local.get("config");'],
    ['src/config/schema.ts', 'globalThis.chrome.storage.local.get("config");'],
    ['src/config/schema.ts', 'import "../browser/config-storage";'],
    ['src/config/schema.ts', 'import "../rules/other";'],
    ['src/rules/grouping.ts', 'chrome.tabs.query({});'],
    ['src/rules/grouping.ts', 'globalThis.browser.tabs.query({});'],
    ['src/rules/grouping.ts', 'import "../browser/config-storage";'],
    ['src/rules/grouping.ts', 'import type { Config } from "../config/schema";'],
    ['src/rules/grouping.ts', 'export * from "../background/coordinator";'],
    ['src/rules/grouping.ts', 'import("../options/view");'],
    ['src/rules/grouping.ts', 'import "external-matcher";'],
    ['src/options/view.ts', 'import "../background/coordinator";'],
    ['src/options/view.ts', 'import type { Config } from "../background/coordinator";'],
    ['src/background/coordinator.ts', 'import "../options/view";'],
    ['src/background/coordinator.ts', 'export * from "../options/view";'],
    ['src/options/view.ts', 'import("../background/coordinator");'],
  ])('rejects forbidden dependency in %s: %s', (name, source) => {
    const f = fixture(); f.write(name, source);
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('boundary');
  });
  it('accepts typed config imports and harmless Chrome words in comments', () => {
    const f = fixture(); f.write('src/config/repository.ts', '// chrome globals belong in browser adapters\nimport type { Config } from \"./schema\"; export type State = Config;');
    expect(check(f.root).status).toBe(0);
  });
  it('accepts the shared pure grouping validator as a narrow config dependency', () => {
    const f = fixture();
    f.write('src/config/schema.ts', 'import { compileGroupingRules } from "../rules/grouping";');
    f.write('src/rules/grouping.ts', 'export function compileGroupingRules() { return new URLPattern({ protocol: "https" }); }');
    expect(check(f.root).status).toBe(0);
  });
  it('rejects transitive browser coupling through the shared grouping validator', () => {
    const f = fixture();
    f.write('src/config/schema.ts', 'import { compileGroupingRules } from "../rules/grouping";');
    f.write('src/rules/grouping.ts', 'import "../browser/config-storage";');
    const result = check(f.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/rules/grouping.ts imports src/browser/config-storage');
  });
  it('checks the actual source tree', () => {
    // Build artifacts are checked separately; this invokes the same policy in source-only mode.
    const result = checkSource(); expect(result.status).toBe(0);
  });
});
function checkSource() { return spawnSync(process.execPath, [resolve('scripts/check-package.mjs'), '--sources-only'], { encoding: 'utf8' }); }
