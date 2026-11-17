import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const check = ajv.compile(read('../schema/exia-package.schema.json'));

for (const name of readdirSync(new URL('../examples/', import.meta.url))) {
  test(`schema accepts example ${name}`, () => {
    assert.ok(check(read(`../examples/${name}/exia.json`)), JSON.stringify(check.errors));
  });
}

for (const vector of read('./vectors.json').vectors) {
  test(`schema accepts vector: ${vector.name}`, () => {
    assert.ok(check(vector.package), JSON.stringify(check.errors));
  });
}

// Fixtures whose rule the schema can express (the rest are validator-only, see SPEC.md section 8).
const schemaRules = ['missing id', 'newer protocol', 'id not reverse-DNS', 'bad version', 'title too long', 'description on two lines',
  'no items', 'unknown item type', 'icon over http', 'reserved callback id', 'addon url without manifest.json', 'config with a templated url end',
  'config value is an object', 'secret with a default', 'choice with one option', 'login without callback', 'duplicate extension ids',
  'kitsu with a key', 'tmdb first', 'metadata with nothing to set'];

for (const fixture of read('./invalid.json').filter((f) => schemaRules.includes(f.name))) {
  test(`schema rejects: ${fixture.name}`, () => {
    assert.equal(check(fixture.package), false);
  });
}
