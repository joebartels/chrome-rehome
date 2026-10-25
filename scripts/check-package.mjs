import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

function fail(kind, detail) { throw new Error(`${kind}: ${detail}`); }
function files(root, folder = '') {
  return readdirSync(resolve(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const name = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail('files', `symlink ${name}`);
    return entry.isDirectory() ? files(root, name) : [name];
  }).sort();
}
function read(root, name) { return readFileSync(resolve(root, name), 'utf8'); }
// TypeScript 7 exposes its scanner under the pinned unstable AST entry point.
// Token scanning also catches type-only dependencies that esbuild intentionally erases.
function tokens(text) {
  const scanner = createScanner(true, undefined, text), result = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    result.push({ kind, text: scanner.getTokenValue() || scanner.getTokenText() });
  }
  return result;
}
function dependencies(items) {
  return items.flatMap((token, index) => {
    if (token.text === 'from' && items[index + 1]?.kind === SyntaxKind.StringLiteral) return [items[index + 1].text];
    if (token.text === 'import' || token.text === 'require') {
      const next = items[index + 1]?.text === '(' ? items[index + 2] : items[index + 1];
      if (next?.kind === SyntaxKind.StringLiteral) return [next.text];
    }
    return [];
  });
}
function layer(name) { return name.split('/')[1]; }
function checkDependency(name, target) {
  const from = layer(name);
  const to = layer(target);
  const groupingValidator = target === 'src/rules/grouping' || target === 'src/rules/grouping.ts';
  if ((from === 'config' && to !== 'config' && !groupingValidator) || (from === 'rules' && to !== 'rules') ||
    (from === 'background' && to === 'options') || (from === 'options' && to === 'background')) fail('boundary', `${name} imports ${target}`);
}
export function checkSources(root) {
  for (const name of files(resolve(root, 'src')).filter((name) => /\.ts$/.test(name))) {
    const fullName = `src/${name}`;
    const items = tokens(read(root, fullName));
    if (['config', 'rules'].includes(layer(fullName)) && items.some((token) => ['chrome', 'browser'].includes(token.text))) fail('boundary', `${fullName} references browser globals`);
    for (const specifier of dependencies(items)) {
      const target = specifier.startsWith('.') ? relative(root, resolve(root, dirname(fullName), specifier)) : specifier;
      if (['config', 'rules'].includes(layer(fullName)) && !specifier.startsWith('.')) fail('boundary', `${fullName} imports ${specifier}`);
      checkDependency(fullName, target);
    }
  }
}
function checkManifest(manifest) {
  const keys = ['manifest_version', 'name', 'version', 'minimum_chrome_version', 'permissions', 'background', 'options_ui'];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const version = typeof manifest.version === 'string' ? manifest.version.split('.') : [];
  const validVersion = version.length === 3 && version.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65535) && version.some((part) => Number(part) > 0);
  if (!same(Object.keys(manifest).sort(), keys.sort()) || manifest.manifest_version !== 3 || manifest.name !== 'ChromeReHome' || !validVersion || manifest.minimum_chrome_version !== '120' ||
    !same([...manifest.permissions ?? []].sort(), ['tabs', 'tabGroups', 'storage', 'webNavigation'].sort()) ||
    !same(manifest.background, { service_worker: 'background/index.js', type: 'module' }) ||
    !same(manifest.options_ui, { page: 'options/index.html', open_in_tab: true })) fail('manifest', 'unexpected fields, permissions, version or entry points');
}
function checkCode(root) {
  for (const name of ['background/index.js', 'options/index.js']) {
    const forbidden = ['eval', 'Function', 'importScripts', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker', 'import'];
    const items = tokens(read(root, `dist/${name}`));
    if (dependencies(items).length || items.some((token) => forbidden.includes(token.text))) fail('code', `executable loading or network primitive in ${name}`);
  }
  const html = read(root, 'dist/options/index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if ([...html.matchAll(/<script\b/gi)].length !== 1 || scripts.length !== 1 || !/^\s*type="module"\s+src="\.\/index\.js"\s*$/.test(scripts[0][1]) || scripts[0][2].trim() || /\bon\w+\s*=|javascript:|<iframe|<object|<embed/i.test(html)) fail('code', 'options HTML must load only its local module');
  const links = [...html.matchAll(/<link\b([^>]*)>/gi)];
  if (links.length !== 1 || !/^\s*rel="stylesheet"\s+href="\.\/styles\.css"\s*$/.test(links[0][1])) fail('code', 'options HTML must load only its local stylesheet');
  if (/@import|url\s*\(/i.test(read(root, 'dist/options/styles.css'))) fail('code', 'stylesheet loads external assets');
}
function checkGraph(root) {
  const graph = JSON.parse(read(root, '.build/metafile.json'));
  const expected = ['dist/background/index.js', 'dist/options/index.js'];
  if (JSON.stringify(Object.keys(graph.outputs).sort()) !== JSON.stringify(expected)) fail('boundary', 'unexpected bundle outputs');
  for (const name of expected) {
    const output = graph.outputs[name];
    if (output.entryPoint !== name.replace('dist/', 'src/').replace('.js', '.ts') || !Array.isArray(output.imports) || output.imports.length) fail('boundary', `invalid entry or external imports in ${name}`);
    if (!Object.hasOwn(output.inputs, output.entryPoint)) fail('boundary', `missing entry dependency in ${name}`);
    for (const input of Object.keys(output.inputs)) {
      if (!input.startsWith('src/') || input.includes('..')) fail('boundary', `non-source dependency ${input}`);
      checkDependency(output.entryPoint, input);
    }
  }
  for (const [name, input] of Object.entries(graph.inputs)) {
    if (!name.startsWith('src/')) fail('boundary', `unexpected build dependency ${name}`);
    for (const dependency of input.imports) {
      if (dependency.external) fail('boundary', `external dependency ${dependency.path}`);
      checkDependency(name, dependency.path);
    }
  }
}
export function checkPackage(root) {
  const expected = ['background/index.js', 'manifest.json', 'options/index.html', 'options/index.js', 'options/styles.css'];
  let actual;
  try { actual = files(resolve(root, 'dist')); } catch (error) { fail('files', error.message); }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('files', `expected exactly five distribution files; found ${actual.join(', ')}`);
  checkManifest(JSON.parse(read(root, 'dist/manifest.json')));
  checkCode(root);
  checkSources(root);
  checkGraph(root);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf('--root');
  const root = rootIndex >= 0 ? resolve(process.argv[rootIndex + 1]) : fileURLToPath(new URL('../', import.meta.url));
  try {
    if (process.argv.includes('--sources-only')) checkSources(root); else checkPackage(root);
    console.log('Package checks passed.');
  } catch (error) { console.error(`Package check failed: ${error.message}`); process.exitCode = 1; }
}
