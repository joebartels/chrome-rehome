import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach } from 'vitest';

const roots: string[] = [];
export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'chromerehome-package-'));
  roots.push(root);
  const write = (name: string, value: string | object) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const manifest = { manifest_version: 3, name: 'ChromeReHome', version: '0.1.0', minimum_chrome_version: '120', permissions: ['tabs', 'tabGroups', 'storage', 'webNavigation'], background: { service_worker: 'background/index.js', type: 'module' }, options_ui: { page: 'options/index.html', open_in_tab: true } };
  write('dist/manifest.json', manifest);
  write('dist/background/index.js', 'const worker = true;');
  write('dist/options/index.js', 'const options = true;');
  write('dist/options/index.html', '<link rel="stylesheet" href="./styles.css"><script type="module" src="./index.js"></script>');
  write('dist/options/styles.css', 'body { color: black }');
  write('.build/metafile.json', { inputs: { 'src/background/index.ts': { imports: [] }, 'src/options/index.ts': { imports: [] } }, outputs: { 'dist/background/index.js': { entryPoint: 'src/background/index.ts', inputs: { 'src/background/index.ts': {} }, imports: [] }, 'dist/options/index.js': { entryPoint: 'src/options/index.ts', inputs: { 'src/options/index.ts': {} }, imports: [] } } });
  write('src/background/index.ts', 'export {};');
  write('src/options/index.ts', 'export {};');
  write('src/config/schema.ts', 'export {};');
  return { root, write, manifest };
}
export function check(root: string) {
  return spawnSync(process.execPath, [resolve('scripts/check-package.mjs'), '--root', root], { encoding: 'utf8' });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
