import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validate } from '../src/index.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

for (const name of readdirSync(new URL('../examples/', import.meta.url))) {
  test(`example ${name} is valid with no warnings`, () => {
    const result = validate(read(`../examples/${name}/exia.json`));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });
}

for (const vector of read('./vectors.json').vectors) {
  test(`vector package is valid: ${vector.name}`, () => {
    assert.deepEqual(validate(vector.package).errors, []);
  });
}

for (const fixture of read('./invalid.json')) {
  test(`${fixture.warning ? 'warns' : 'rejects'}: ${fixture.name}`, () => {
    const result = validate(fixture.package);
    const list = fixture.warning ? result.warnings : result.errors;
    const [path, text] = fixture.error;
    const hit = list.find((e) => e.path === path && e.message.includes(text));
    assert.ok(hit, `expected ${path}: …${text}… in ${JSON.stringify(list)}`);
    if (!fixture.warning) assert.equal(result.valid, false);
  });
}

test('a non-object is rejected', () => {
  assert.equal(validate([]).valid, false);
  assert.equal(validate(null).valid, false);
});

test('unknown properties only warn', () => {
  const result = validate({
    exia: 1, id: 'org.example.x', name: 'X', version: '1.0.0', homepage: 'https://example.org',
    items: [{ type: 'repository', title: 'R', url: 'https://r.example.org' }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.warnings[0].path, 'homepage');
});
