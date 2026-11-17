import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWithPositions, positionOf } from '../src/locate.js';
import { validate, closest } from '../src/index.js';

const text = `{
  "exia": 1,
  "id": "org.example.x",
  "name": "X",
  "version": "1.0.0",
  "items": [
    { "type": "addon", "title": "A",
      "url": "https://a.example.org/manifest" }
  ]
}`;

test('parses like JSON.parse', () => {
  assert.deepEqual(parseWithPositions(text).value, JSON.parse(text));
});

test('points validator paths at their line and column', () => {
  const { value, positions } = parseWithPositions(text);
  const [error] = validate(value).errors;
  assert.equal(error.path, 'items[0].url');
  assert.match(error.message, /add "\.json"/);
  assert.deepEqual(positionOf(positions, error.path), { line: 8, column: 14 });
});

test('a missing property points at its parent', () => {
  const { positions } = parseWithPositions(text);
  assert.deepEqual(positionOf(positions, 'items[0].fields[0].id'), { line: 7, column: 5 });
});

test('syntax errors carry a line and column', () => {
  assert.throws(() => parseWithPositions('{\n  "a": 1,\n}'), (e) => e.line === 3 && e.column === 1 && /comma/.test(e.message));
  assert.throws(() => parseWithPositions("{ 'a': 1 }"), /double quotes/);
});

test('typos get a suggestion', () => {
  assert.equal(closest('titel', ['type', 'title', 'url']), 'title');
  assert.equal(closest('repo', ['repository', 'addon', 'metadata']), null);
  const result = validate({ exia: 1, id: 'org.example.x', name: 'X', version: '1.0.0', items: [{ type: 'addon', title: 'A', url: 'https://a.example.org/manifest.json', titel: 'B' }] });
  assert.match(result.warnings[0].message, /did you mean "title"/);
});
