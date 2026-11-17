import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, probes, installLink } from '../src/index.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const example = (name) => read(`../examples/${name}/exia.json`);

for (const vector of read('./vectors.json').vectors) {
  test(`vector: ${vector.name}`, () => {
    const plan = render(vector.package, { values: vector.values });
    assert.deepEqual(plan.items.filter((i) => i.enabled).map((i) => i.url), vector.urls);
  });
}

test('required fields are missing until filled, and only while shown', () => {
  const pkg = example('configured-addons');
  assert.deepEqual(render(pkg).missing.map((m) => m.id), ['libraryURL', 'account']);
  assert.deepEqual(render(pkg, { values: { plan: 'member' } }).missing.map((m) => m.id), ['apiKey', 'libraryURL', 'account']);
  // Switching items off drops their fields.
  assert.deepEqual(render(pkg, { enabled: { 1: false, 2: false } }).missing, []);
});

test('required items stay on', () => {
  const plan = render(example('configured-addons'), { enabled: { 0: false } });
  assert.equal(plan.items[0].enabled, true);
});

test('an empty metadata key is skipped, first still applies', () => {
  const plan = render(example('starter'));
  assert.equal(plan.items[2].first, true);
  assert.equal(plan.items[2].skipped, undefined);
  assert.equal(plan.items[3].skipped, true);
  assert.equal(render(example('starter'), { values: { tmdbKey: 'abc' } }).items[3].key, 'abc');
});

test('probes: repositories try both indexes, configured addons check the plain manifest', () => {
  const urls = probes(example('minimal'));
  assert.deepEqual(urls[0], ['https://comics.example.org/sources/index.min.json', 'https://comics.example.org/sources/versioning.json']);
  const configured = probes(example('configured-addons'));
  assert.deepEqual(configured[0], ['https://courses.example.org/manifest.json']);
  assert.equal(configured[1], null); // personal link not filled in yet
  assert.deepEqual(probes(example('starter'))[0], ['https://comics.example.org/sources/index.min.json']);
  assert.equal(probes(example('starter'))[2], null);
});

test('install links', () => {
  const { app, web } = installLink('https://me.github.io/pack/exia.json');
  assert.equal(app, 'projectexia://add?url=https%3A%2F%2Fme.github.io%2Fpack%2Fexia.json');
  assert.equal(web, 'https://tronschell.github.io/exia-protocol/install/?url=https%3A%2F%2Fme.github.io%2Fpack%2Fexia.json');
});
