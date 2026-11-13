import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import GithubSlugger from 'github-slugger';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: true });
const isMarkdown = path => /\.(?:md|markdown)$/i.test(path);
const isExternal = href => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);

function readDocument(content) {
  const slugger = new GithubSlugger();
  const anchors = new Set();
  const links = [];

  function addHtmlAnchors(html) {
    for (const [tag] of html.matchAll(/<a\s[^<>]*>/gi)) {
      for (const [, quote, name] of tag.matchAll(/\s(?:id|name)\s*=\s*(["'])(.*?)\1/gi)) {
        anchors.add(markdown.utils.unescapeAll(name));
      }
    }
  }

  function collectLinks(tokens, line) {
    for (const token of tokens) {
      if (token.type === 'link_open') links.push({ href: token.attrGet('href'), line });
      if (token.type === 'image') links.push({ href: token.attrGet('src'), line });
      if (token.type === 'html_inline') addHtmlAnchors(token.content);
      if (token.children) collectLinks(token.children, line);
    }
  }

  const tokens = markdown.parse(content, {});
  let line = 1;
  for (const [index, token] of tokens.entries()) {
    if (token.map) line = token.map[0] + 1;
    if (token.type === 'heading_open') {
      const text = tokens[index + 1].children
        .filter(child => child.type === 'text' || child.type === 'code_inline')
        .map(child => child.content)
        .join('');
      anchors.add(slugger.slug(text));
    }
    if (token.type === 'inline') collectLinks(token.children, line);
    if (token.type === 'html_block') addHtmlAnchors(token.content);
  }

  return { anchors, links };
}

function checkLink(source, href, files, directories, documents) {
  if (isExternal(href)) return;

  const [, path, fragment = ''] = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(href);
  const decodedPath = decodeURIComponent(path);
  const target = !decodedPath
    ? source
    : decodedPath.startsWith('/')
      ? posix.normalize(decodedPath.slice(1))
      : posix.join(posix.dirname(source), decodedPath);
  const normalized = target.replace(/\/$/, '');

  if (!files.has(normalized) && !directories.has(normalized)) {
    return 'missing repository path';
  }
  if (fragment && documents.has(normalized) && !documents.get(normalized).anchors.has(decodeURIComponent(fragment))) {
    return 'missing Markdown anchor';
  }
}

function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trimEnd();
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });
  const files = new Set();
  const directories = new Set(['.', '']);
  const documents = new Map();

  for (const path of new Set(paths.split('\0').filter(Boolean).sort())) {
    const absolute = join(root, path);
    const entry = lstatSync(absolute, { throwIfNoEntry: false });
    if (!entry) continue;
    files.add(path);
    for (let dir = posix.dirname(path); !directories.has(dir); dir = posix.dirname(dir)) {
      directories.add(dir);
    }
    if (entry.isFile() && isMarkdown(path)) {
      documents.set(path, readDocument(readFileSync(absolute, 'utf8')));
    }
  }

  let broken = 0;
  for (const [source, { links }] of documents) {
    for (const { href, line } of links) {
      let problem;
      try {
        problem = checkLink(source, href, files, directories, documents);
      } catch (error) {
        if (!(error instanceof URIError)) throw error;
        problem = 'invalid URL encoding';
      }
      if (problem) {
        console.error(`${source}:${line}: ${problem} (${href})`);
        broken++;
      }
    }
  }
  if (broken) {
    console.error(`Found ${broken} broken documentation link(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Checked local links in ${documents.size} Markdown files.`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Documentation link check failed: ${error.message}`);
  process.exitCode = 1;
}
