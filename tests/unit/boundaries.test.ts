import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, check } from '../package-fixture';

describe('source boundaries', () => {
  it.each([
    ['src/popup/controller.ts', 'import "../background/controls";'],
    ['src/popup/view.ts', 'import type { EditorState } from "../options/controller";'],
    ['src/options/view.ts', 'import "../popup/view";'],
    ['src/background/index.ts', 'import "../popup/controller";'],
    ['src/config/schema.ts', 'chrome.storage.local.get("config");'],
    ['src/config/schema.ts', 'globalThis.chrome.storage.local.get("config");'],
    ['src/config/schema.ts', 'import "../browser/config-storage";'],
    ['src/config/schema.ts', 'import "../rules/other";'],
    ['src/planning/group-destination.ts', 'chrome.tabs.query({});'],
    ['src/planning/group-destination.ts', 'globalThis.browser.tabs.query({});'],
    ['src/planning/group-destination.ts', 'import "../browser/group-placement";'],
    ['src/planning/group-destination.ts', 'import type { Port } from "../execution/group-placement";'],
    ['src/planning/group-destination.ts', 'import "@vendor/planning";'],
    ['src/planning/group-destination.ts', 'import type { Rule } from "@vendor/planning";'],
    ['src/execution/group-placement.ts', 'import "../browser/group-placement";'],
    ['src/execution/group-placement.ts', 'import type { Queue } from "../background/operation-queue";'],
    ['src/execution/group-placement.ts', 'chrome.tabs.group({});'],
    ['src/rules/grouping.ts', 'chrome.tabs.query({});'],
    ['src/rules/grouping.ts', 'globalThis.browser.tabs.query({});'],
    ['src/rules/grouping.ts', 'import "../browser/config-storage";'],
    ['src/rules/grouping.ts', 'import type { Config } from "../config/schema";'],
    ['src/rules/grouping.ts', 'export * from "../background/coordinator";'],
    ['src/rules/grouping.ts', 'import("../options/view");'],
    ['src/rules/grouping.ts', 'import "external-matcher";'],
    ['src/rules/grouping.ts', 'import "@vendor/rules";'],
    ['src/rules/grouping.ts', 'import type { Rule } from "@vendor/rules";'],
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
  it.each(['../rules/duplicates', '../rules/duplicates.ts'])('accepts only the exact shared duplicates validator %s', specifier => {
    const f = fixture();
    f.write('src/config/schema.ts', 'import { compileDuplicateRules } from "'+specifier+'";');
    f.write('src/rules/duplicates.ts', 'export function compileDuplicateRules() { return new URL("https://example.test"); }');
    expect(check(f.root).status).toBe(0);
  });
  it.each([
    ['src/config/schema.ts', 'import "../rules/duplicates-extra";'],
    ['src/rules/duplicates.ts', 'import "../browser/config-storage";'],
    ['src/rules/duplicates.ts', 'import type { Config } from "../config/schema";'],
    ['src/rules/duplicates.ts', 'import "@vendor/parser";'],
    ['src/rules/duplicates.ts', 'import type { Rule } from "@vendor/parser";'],
    ['src/rules/duplicates.ts', 'chrome.tabs.query({});'],
    ['src/rules/duplicates.ts', 'globalThis.browser.tabs.query({});'],
  ])('rejects duplicate validator boundary violation in %s: %s', (name, source) => {
    const f = fixture();
    f.write('src/config/schema.ts', 'import "../rules/duplicates";');
    f.write(name, source);
    const result = check(f.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('boundary');
  });
  it('accepts pure planning/rules and structural execution dependencies', () => {
    const f = fixture();
    f.write('src/planning/group-destination.ts', 'import "../rules/grouping"; import type { Tab } from "./types";');
    f.write('src/execution/group-placement.ts', 'import type { Plan } from "../planning/group-destination"; import "./helper";');
    expect(check(f.root).status).toBe(0);
  });
  it('checks the actual source tree', () => {
    // Build artifacts are checked separately; this invokes the same policy in source-only mode.
    const result = checkSource(); expect(result.status).toBe(0);
  });
});
function checkSource() { return spawnSync(process.execPath, [resolve('scripts/check-package.mjs'), '--sources-only'], { encoding: 'utf8' }); }
