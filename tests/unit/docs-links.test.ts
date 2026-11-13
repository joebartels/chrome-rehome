import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const checker = fileURLToPath(new URL('../../scripts/check-docs.mjs', import.meta.url));
let repository: string;

beforeEach(() => {
  repository = mkdtempSync(join(tmpdir(), 'chromerehome-docs-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repository });
});

afterEach(() => rmSync(repository, { recursive: true, force: true }));

function write(relativePath: string, content: string) {
  const path = join(repository, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function check() {
  return spawnSync(process.execPath, [checker], { cwd: repository, encoding: 'utf8' });
}

describe('documentation link check', () => {
  it('checks archive Markdown and reports missing files and headings', () => {
    write('README.md', '# Welcome\n');
    write('docs/archive/notes.md', [
      '# Notes',
      '',
      '[Missing file](../missing.md)',
      '',
      '[Missing heading][welcome]',
      '',
      '[welcome]: ../../README.md#missing',
    ].join('\n'));
    execFileSync('git', ['add', '.'], { cwd: repository });

    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/docs\/archive\/notes\.md:3:.*\.\.\/missing\.md/);
    expect(result.stderr).toMatch(/docs\/archive\/notes\.md:5:.*\.\.\/\.\.\/README\.md#missing/);
  });

  it('resolves inline and reference destinations through Markdown and URL encoding', () => {
    write('README.md', [
      '# Welcome',
      '',
      '[Duplicate heading][guide]',
      '[First heading](docs/Caf%C3%A9%20(guide).md#caf%C3%A9-setup)',
      '[Custom anchor](docs/Caf%C3%A9%20%28guide%29.md#details)',
      '[Current page](#welcome)',
      '[Root-relative path](/docs/)',
      '![Diagram](docs/diagram\\(v2\\).png)',
      '[External](https://example.com/missing.md#not-checked)',
      '`[Inline example](missing.md)`',
      '',
      '[guide]: <docs/Café (guide).md#café-setup-1>',
      '',
      '| Screenshot |',
      '| --- |',
      '| ![Diagram][diagram] |',
      '',
      '[diagram]: docs/diagram(v2).png',
      '',
      '```md',
      '[Fenced example](missing.md)',
      '```',
    ].join('\n'));
    write('docs/Café (guide).md', '# Café *setup*\n\nCafé `setup`\n----------\n\n<a id="details"></a>\n');
    write('docs/diagram(v2).png', '');

    const result = check();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('requires paths with the published case and ignores untracked private evidence', () => {
    write('.gitignore', 'browser-reports/\n');
    write('browser-reports/private.md', '[Ignored evidence](missing.md)\n');
    write('README.md', '[Case mismatch](guide.md)\n\n[Ignored target](browser-reports/private.md)\n');
    write('Guide.md', '# Guide\n');

    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/README\.md:1:.*guide\.md/);
    expect(result.stderr).toMatch(/README\.md:3:.*browser-reports\/private\.md/);
    expect(result.stderr).not.toMatch(/^browser-reports\/private\.md:/m);
  });
});
