#!/usr/bin/env node
// exia-package: validate, preview and check Exia packages.
//
//   exia-package validate <exia.json | URL>
//   exia-package render   <exia.json | URL> [--set id=value ...] [--off N ...]
//   exia-package check    <exia.json | URL> [--set id=value ...]
//   exia-package link     <hosted exia.json URL>

import { readFile } from 'node:fs/promises';
import { validate, render, probes, installLink } from '../src/index.js';

const USAGE = `Usage:
  exia-package validate <exia.json | URL>
  exia-package render   <exia.json | URL> [--set id=value ...] [--off itemIndex ...]
  exia-package check    <exia.json | URL> [--set id=value ...]
  exia-package link     <hosted exia.json URL>`;

async function load(source) {
  const text = /^https?:\/\//.test(source)
    ? await fetch(source, { headers: { accept: 'application/json' } }).then((r) => {
      if (!r.ok) throw new Error(`${source} answered ${r.status}`);
      return r.text();
    })
    : await readFile(source, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${source} isn't valid JSON: ${e.message}`);
  }
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

function report({ errors, warnings }) {
  for (const e of errors) console.log(`error   ${e.path || '(package)'}: ${e.message}`);
  for (const w of warnings) console.log(`warning ${w.path || '(package)'}: ${w.message}`);
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

async function main() {
  const [command, source, ...rest] = process.argv.slice(2);
  if (!command || !source || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  if (command === 'link') {
    const { app, web } = installLink(source);
    console.log(`App link:  ${app}`);
    console.log(`Web link:  ${web}`);
    console.log('\nHTML (black badge):');
    console.log(`<a href="${web}"><img src="https://raw.githubusercontent.com/tronschell/exia-protocol/main/badges/install-in-exia-black.svg" alt="Install in Exia" height="48"></a>`);
    console.log('\nMarkdown:');
    console.log(`[![Install in Exia](https://raw.githubusercontent.com/tronschell/exia-protocol/main/badges/install-in-exia-black.svg)](${web})`);
    return 0;
  }

  const pkg = await load(source);
  const result = validate(pkg);

  if (command === 'validate') {
    report(result);
    console.log(result.valid ? `valid: ${pkg.name} ${pkg.version}` : `invalid: ${result.errors.length} error(s)`);
    return result.valid ? 0 : 1;
  }

  if (!result.valid) {
    report(result);
    return 1;
  }

  const options = parseOptions(rest, pkg);
  if (command === 'render') {
    console.log(JSON.stringify(render(pkg, options), null, 2));
    return 0;
  }

  if (command === 'check') {
    const plan = render(pkg, options);
    const urls = probes(pkg, options);
    let down = 0;
    for (const item of plan.items) {
      const list = urls[item.index];
      if (!list) {
        console.log(`  -  ${item.title}${item.type === 'metadata' ? '' : ' (fill in its fields to check it)'}`);
        continue;
      }
      const status = await reachable(list);
      if (!status.ok) down++;
      console.log(`${status.ok ? 'up  ' : 'DOWN'} ${item.title}  ${status.url}`);
    }
    return down === 0 ? 0 : 2;
  }

  console.log(USAGE);
  return 1;
}

main().then((code) => process.exit(code), (e) => {
  console.error(e.message);
  process.exit(1);
});
