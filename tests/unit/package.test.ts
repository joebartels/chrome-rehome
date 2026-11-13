import { describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, check } from '../package-fixture';

describe('package policy', () => {
  it('accepts a complete local-only package', () => { expect(check(fixture().root).status).toBe(0); });
  it.each(['dist/background/index.js', 'dist/LICENSE'])('rejects missing file %s', (name) => {
    const f = fixture(); rmSync(join(f.root, name));
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('files');
  });
  it('rejects a license that differs from the repository license', () => {
    const f = fixture(); f.write('dist/LICENSE', 'Altered license notice\n');
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('license');
  });
  it.each(['dist/test.js', 'dist/options/index.js.map'])('rejects unexpected file %s', (name) => {
    const f = fixture(); f.write(name, '{}');
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('files');
  });
  it.each([
    { permissions: ['tabs', 'tabGroups', 'storage', 'webNavigation'] },
    { permissions: ['tabs', 'tabGroups', 'storage', 'webNavigation', 'contextMenus', 'contextMenus'] },
    { version: '0.0.0' }, { version: '99999.1.0' }, { version: '01.1.0' },
    { permissions: ['tabs', 'tabGroups', 'storage', 'webNavigation', 'contextMenus', 'debugger'] },
    { host_permissions: ['<all_urls>'] }, { content_scripts: [] }, { action: { default_popup: 'options/index.html' } },
    { background: { service_worker: 'background/index.js' } }, { minimum_chrome_version: '119' },
    { options_ui: { page: 'options/index.html', open_in_tab: false } },
  ])('rejects broadened or invalid manifest %j', (change) => {
    const f = fixture(); f.write('dist/manifest.json', { ...f.manifest, ...change });
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('manifest');
  });
  it.each([
    ['dist/popup/index.js', 'fetch("https://example.com")'],
    ['dist/popup/index.html', '<script src="https://example.com/code.js"></script>'],
    ['dist/popup/styles.css', 'body { background: url(https://example.com/a.png) }'],
    ['dist/background/index.js', 'eval("alert(1)")'],
    ['dist/background/index.js', 'new Function("return 1")'],
    ['dist/background/index.js', 'import("https://example.com/code.js")'],
    ['dist/options/index.js', 'export { run } from "https://example.com/code.js"'],
    ['dist/options/index.html', '<link rel="stylesheet" href="./styles.css"><script type="module" src="./index.js"></script><script src="https://example.com/code.js"/>'],
    ['dist/options/index.js', 'importScripts("https://example.com/code.js")'],
    ['dist/options/index.html', '<script src="https://example.com/code.js"></script>'],
    ['dist/options/styles.css', '@import "https://example.com/style.css";'],
  ])('rejects forbidden code loading in %s: %s', (name, value) => {
    const f = fixture(); f.write(name, value);
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('Package check failed: code');
  });
  it.each(['external', 'non-source', 'extra-output'])('rejects invalid dependency graph: %s', (kind) => {
    const f = fixture();
    const graph = { inputs: { 'src/background/index.ts': { imports: kind === 'external' ? [{ path: 'https://example.com/module.js', external: true }] : [] } }, outputs: { 'dist/popup/index.js': { entryPoint: 'src/popup/index.ts', inputs: { 'src/popup/index.ts': {} }, imports: [] }, 'dist/background/index.js': { entryPoint: 'src/background/index.ts', inputs: { 'src/background/index.ts': {}, ...(kind === 'non-source' ? { 'node_modules/tool/index.js': {} } : {}) }, imports: [] }, 'dist/options/index.js': { entryPoint: 'src/options/index.ts', inputs: { 'src/options/index.ts': {} }, imports: [] }, ...(kind === 'extra-output' ? { 'dist/shared.js': {} } : {}) } };
    f.write('.build/metafile.json', graph);
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('boundary');
  });
  it.each(['src/browser/group-placement.ts', 'src/config/schema.ts', '@vendor/planning'])('rejects forbidden planning graph dependency %s', target => {
    const f = fixture();
    const graph = { inputs: { 'src/planning/group-destination.ts': { imports: [{ path: target }] } }, outputs: { 'dist/popup/index.js': { entryPoint: 'src/popup/index.ts', inputs: { 'src/popup/index.ts': {} }, imports: [] }, 'dist/background/index.js': { entryPoint: 'src/background/index.ts', inputs: { 'src/background/index.ts': {}, 'src/planning/group-destination.ts': {} }, imports: [] }, 'dist/options/index.js': { entryPoint: 'src/options/index.ts', inputs: { 'src/options/index.ts': {} }, imports: [] } } };
    f.write('.build/metafile.json', graph);
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('boundary');
  });
  it('rejects a graph with no recorded entry dependencies', () => {
    const f = fixture(); f.write('.build/metafile.json', { inputs: {}, outputs: { 'dist/popup/index.js': { entryPoint: 'src/popup/index.ts', inputs: { 'src/popup/index.ts': {} }, imports: [] }, 'dist/background/index.js': { entryPoint: 'src/background/index.ts', inputs: {}, imports: [] }, 'dist/options/index.js': { entryPoint: 'src/options/index.ts', inputs: {}, imports: [] } } });
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('boundary');
  });
  it('rejects UI bundled into the worker dependency graph', () => {
    const f = fixture(); f.write('.build/metafile.json', { inputs: {}, outputs: { 'dist/popup/index.js': { entryPoint: 'src/popup/index.ts', inputs: { 'src/popup/index.ts': {} }, imports: [] }, 'dist/background/index.js': { entryPoint: 'src/background/index.ts', inputs: { 'src/background/index.ts': {}, 'src/options/view.ts': {} }, imports: [] }, 'dist/options/index.js': { entryPoint: 'src/options/index.ts', inputs: {}, imports: [] } } });
    const result = check(f.root); expect(result.status).toBe(1); expect(result.stderr).toContain('boundary');
  });
});
