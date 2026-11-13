import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('builds three deterministic independent entries and removes stale distribution files', () => {
  const root = mkdtempSync(join(tmpdir(), 'chromerehome-build-'));
  try {
    for (const name of ['src', 'scripts', 'manifest.json', 'LICENSE']) cpSync(resolve(name), join(root, name), { recursive: true });
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    const build = () => spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root, encoding: 'utf8' });
    const first = build(); expect(first.stderr).toBe(''); expect(first.status).toBe(0);
    const names = ['LICENSE', 'manifest.json', 'background/index.js', 'options/index.js', 'options/index.html', 'options/styles.css', 'popup/index.js', 'popup/index.html', 'popup/styles.css'];
    const contents = names.map((name) => readFileSync(join(root, 'dist', name), 'utf8'));
    const graph = readFileSync(join(root, '.build/metafile.json'), 'utf8');
    mkdirSync(join(root, 'dist/stale'), { recursive: true });
    writeFileSync(join(root, 'dist/stale/dev-tool.js'), 'throw new Error("must not ship")');
    writeFileSync(join(root, 'dist/options/index.js.map'), '{}');
    const second = build(); expect(second.stderr).toBe(''); expect(second.status).toBe(0);
    expect(names.map((name) => readFileSync(join(root, 'dist', name), 'utf8'))).toEqual(contents);
    expect(readFileSync(join(root, '.build/metafile.json'), 'utf8')).toBe(graph);
    expect(readdirSync(join(root, 'dist')).sort()).toEqual(['LICENSE', 'background', 'manifest.json', 'options', 'popup']);
    const check = spawnSync(process.execPath, [join(root, 'scripts/check-package.mjs')], { cwd: root, encoding: 'utf8' });
    expect(check.stderr).toBe(''); expect(check.status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
