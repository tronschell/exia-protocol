#!/usr/bin/env node
// exia-package: make, check, preview and share Exia packages. Run with no arguments for help.

import { readFile, writeFile, stat, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { validate, render, probes, installLink } from '../src/index.js';
import { parseWithPositions, positionOf } from '../src/locate.js';
import { encodeQR, qrToTerminal } from '../src/qr.js';

const BADGE = 'https://raw.githubusercontent.com/tronschell/exia-protocol/main/badges/install-in-exia-black.svg';

const USAGE = `exia-package: make, check, preview and share Exia packages.

  exia-package init     [exia.json]               Write a starter package to edit
  exia-package validate [exia.json | URL] [--json] Check every rule, with line and column
  exia-package serve    [exia.json] [--port 8787] Test on your phone over Wi-Fi, with a QR code
  exia-package render   [exia.json | URL] [--set id=value ...] [--off itemIndex ...]
                                                   The exact links Exia installs for those answers
  exia-package check    [exia.json | URL] [--set id=value ...]
                                                   Whether each item is reachable now
  exia-package link     <hosted exia.json URL>     Install links, badge HTML and Markdown, QR code

The file defaults to ./exia.json. Spec: https://github.com/tronschell/exia-protocol/blob/main/SPEC.md`;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const red = (t) => paint(31, t);
const yellow = (t) => paint(33, t);
const green = (t) => paint(32, t);
const dim = (t) => paint(2, t);
const bold = (t) => paint(1, t);

const isURL = (source) => /^https?:\/\//.test(source);

async function readSource(source) {
  if (!isURL(source)) return readFile(source, 'utf8');
  const response = await fetch(source, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${source} answered ${response.status}`);
  return response.text();
}

/** Parses and validates; every problem carries a line and column in the source text. */
function inspect(text) {
  let parsed;
  try {
    parsed = parseWithPositions(text);
  } catch (e) {
    return { pkg: null, problems: [{ level: 'error', path: '', message: e.message.replace(/ at line \d+, column \d+$/, ''), line: e.line ?? 1, column: e.column ?? 1 }] };
  }
  const result = validate(parsed.value);
  const place = (level) => (p) => ({ level, ...p, ...positionOf(parsed.positions, p.path) });
  const problems = [...result.errors.map(place('error')), ...result.warnings.map(place('warning'))]
    .sort((a, b) => a.line - b.line || a.column - b.column);
  return { pkg: parsed.value, problems, valid: result.valid };
}

function printProblems(source, problems) {
  const name = isURL(source) ? source : source;
  for (const p of problems) {
    const where = dim(`${name}:${p.line}:${p.column}`);
    const label = p.level === 'error' ? red('error  ') : yellow('warning');
    console.log(`${where}  ${label}  ${p.path ? bold(p.path) + ' ' : ''}${p.message}`);
    if (process.env.GITHUB_ACTIONS === 'true' && !isURL(source)) {
      const message = `${p.path ? p.path + ' ' : ''}${p.message}`.replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
      console.log(`::${p.level} file=${source},line=${p.line},col=${p.column}::${message}`);
    }
  }
}

async function load(source) {
  const text = await readSource(source);
  const { pkg, problems, valid } = inspect(text);
  if (!pkg || !valid) {
    printProblems(source, problems);
    throw new Error(`${source} has ${problems.filter((p) => p.level === 'error').length} error(s); fix them first`);
  }
  return pkg;
}

function parseOptions(args, pkg) {
  const values = {};
  const enabled = {};
  const types = new Map();
  for (const field of [...(pkg.fields ?? []), ...(pkg.items ?? []).flatMap((i) => i.fields ?? [])]) types.set(field.id, field.type);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--set') {
      const [id, ...rest] = (args[++i] ?? '').split('=');
      const value = rest.join('=');
      values[id] = types.get(id) === 'toggle' ? value === 'true' : value;
    } else if (args[i] === '--off') {
      enabled[Number(args[++i])] = false;
    }
  }
  return { values, enabled };
}

async function reachable(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        await response.json();
        return { ok: true, url };
      }
    } catch {
      // try the next one
    }
  }
  return { ok: false, url: urls[0] };
}

function lanAddress() {
  const candidates = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const score = /^(192\.168|10\.)/.test(entry.address) ? 0 : /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address) ? 1 : 2;
      candidates.push({ address: entry.address, score: score + (/^(en|eth|wl)/.test(name) ? 0 : 0.5) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.address ?? '127.0.0.1';
}

const STARTER = (id) => `{
  "$schema": "https://raw.githubusercontent.com/tronschell/exia-protocol/main/schema/exia-package.schema.json",
  "exia": 1,
  "id": "${id}",
  "name": "My Package",
  "description": "What it sets up, in one line.",
  "version": "1.0.0",
  "items": [
    {
      "type": "repository",
      "title": "Manga Repository",
      "description": "An Aidoku or Paperback repository.",
      "url": "https://repo.example.com",
      "ids": ["com.example.source"]
    },
    {
      "type": "addon",
      "title": "Video Addon",
      "description": "A Stremio addon that needs the person's key.",
      "url": "https://addon.example.com/{{apiKey}}/manifest.json",
      "probe": "https://addon.example.com/manifest.json",
      "fields": [
        { "type": "link", "title": "Get an API Key", "url": "https://addon.example.com/keys" },
        { "type": "secret", "id": "apiKey", "title": "API Key", "required": true }
      ]
    }
  ]
}
`;

async function commandInit(file) {
  try {
    await access(file);
    console.log(`${file} already exists; nothing written.`);
    return 1;
  } catch {
    // write it
  }
  const folder = basename(resolve(dirname(file))).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pack';
  await writeFile(file, STARTER(`com.example.${folder}`));
  console.log(`Wrote ${file}. Change the id, name and items, then run:\n  exia-package serve ${file === 'exia.json' ? '' : file}`.trimEnd());
  return 0;
}

async function commandServe(file, args) {
  const index = args.indexOf('--port');
  let port = index >= 0 ? Number(args[index + 1]) : 8787;
  const root = resolve(dirname(file));
  const name = basename(file);
  await stat(file);

  const report = async () => {
    const { problems, valid } = inspect(await readFile(file, 'utf8'));
    const time = new Date().toLocaleTimeString();
    if (problems.length) printProblems(file, problems);
    console.log(dim(time) + '  ' + (valid ? green(`${name} is valid`) : red(`${name} has errors; Exia will refuse it until they're fixed`)));
  };

  const types = { '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.html': 'text/html' };
  const server = createServer(async (request, response) => {
    const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    if (path === '/') {
      const { app } = installLink(packageURL);
      response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#000;color:#fff;font:17px system-ui;display:grid;place-items:center;min-height:90vh"><a style="color:#000;background:#fff;padding:14px 28px;border-radius:28px;text-decoration:none;font-weight:600" href="${app}">Install in Exia</a></body>`);
      return;
    }
    const target = normalize(join(root, path));
    if (!target.startsWith(root + sep) && target !== root) {
      response.writeHead(403, headers).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { ...headers, 'content-type': types[extname(target).toLowerCase()] ?? 'application/octet-stream' });
      response.end(body);
      console.log(dim(`${new Date().toLocaleTimeString()}  ${request.method} ${path}`));
    } catch {
      response.writeHead(404, headers).end();
    }
  });

  const listen = () => new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '0.0.0.0', ok);
  });
  for (let tries = 0; ; tries++) {
    try {
      await listen();
      break;
    } catch (e) {
      if (e.code !== 'EADDRINUSE' || tries > 20) throw e;
      port++;
    }
  }

  const host = lanAddress();
  const packageURL = `http://${host}:${port}/${encodeURI(name)}`;
  const { app } = installLink(packageURL);
  console.log(`\n${bold('Serving')} ${packageURL}\n`);
  console.log(qrToTerminal(encodeQR(app)));
  console.log(`\nScan with your iPhone or iPad camera (same Wi-Fi), or open ${app}`);
  console.log(`After an edit, pull down on the package in Exia to load it again. Other files in this folder are served too.\n`);
  await report();

  let timer = null;
  watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(() => report().catch((e) => console.log(red(e.message))), 150);
  });
  return new Promise(() => {}); // runs until Ctrl-C
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const rest = args.slice(1);
  const source = rest[0] && !rest[0].startsWith('--') ? rest.shift() : 'exia.json';

  switch (command) {
    case 'init':
      return commandInit(source);

    case 'serve':
      if (isURL(source)) throw new Error('serve takes a local file; for a hosted package use check or link');
      return commandServe(source, rest);

    case 'validate': {
      const text = await readSource(source);
      const { pkg, problems, valid } = inspect(text);
      if (rest.includes('--json')) {
        console.log(JSON.stringify({ valid: Boolean(valid), problems }, null, 2));
        return valid ? 0 : 1;
      }
      printProblems(source, problems);
      const errors = problems.filter((p) => p.level === 'error').length;
      console.log(valid ? green(`valid: ${pkg.name} ${pkg.version}`) : red(`invalid: ${errors} error(s)`));
      return valid ? 0 : 1;
    }

    case 'render': {
      const pkg = await load(source);
      console.log(JSON.stringify(render(pkg, parseOptions(rest, pkg)), null, 2));
      return 0;
    }

    case 'check': {
      const pkg = await load(source);
      const options = parseOptions(rest, pkg);
      const plan = render(pkg, options);
      const urls = probes(pkg, options);
      let down = 0;
      for (const item of plan.items) {
        const list = urls[item.index];
        if (!list) {
          console.log(`  -  ${item.title}${item.type === 'metadata' ? '' : dim(' (fill in its fields, or add probe, to check it)')}`);
          continue;
        }
        const status = await reachable(list);
        if (!status.ok) down++;
        console.log(`${status.ok ? green('up  ') : red('DOWN')} ${item.title}  ${dim(status.url)}`);
      }
      return down === 0 ? 0 : 2;
    }

    case 'link': {
      if (!isURL(source)) throw new Error('link takes the URL where exia.json is hosted, like https://you.github.io/pack/exia.json');
      const { app, web } = installLink(source);
      console.log(`App link:  ${app}`);
      console.log(`Web link:  ${web}`);
      console.log('\nHTML:');
      console.log(`<a href="${web}"><img src="${BADGE}" alt="Install in Exia" height="48"></a>`);
      console.log('\nMarkdown:');
      console.log(`[![Install in Exia](${BADGE})](${web})`);
      if (process.stdout.isTTY) console.log(`\n${qrToTerminal(encodeQR(web))}`);
      return 0;
    }

    default:
      console.log(USAGE);
      return 1;
  }
}

main().then((code) => { if (code !== undefined) process.exit(code); }, (e) => {
  console.error(red(e.message));
  process.exit(1);
});
