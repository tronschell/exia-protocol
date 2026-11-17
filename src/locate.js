// Finds where things are in the text of an exia.json, so messages can point at a line and column.
// No dependencies. The parser accepts only what JSON.parse accepts.

/**
 * Parses JSON text and records where every value sits.
 * Returns { value, positions } where positions maps a validator path ("items[1].url", "" for the root) to
 * { line, column } (1-based) of that value, and `key:<path>` to where its property name starts.
 * Throws a SyntaxError with `line` and `column` set when the text isn't valid JSON.
 */
export function parseWithPositions(text) {
  const positions = new Map();
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const here = () => ({ line, column: i - lineStart + 1 });
  const fail = (message) => {
    const at = here();
    const error = new SyntaxError(`${message} at line ${at.line}, column ${at.column}`);
    error.line = at.line;
    error.column = at.column;
    throw error;
  };
  const advance = () => {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
    i++;
  };
  const space = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) advance();
  };
  const expect = (char) => {
    if (text[i] !== char) fail(text[i] === undefined ? `expected "${char}" but the file ended` : `expected "${char}" but found "${text[i]}"`);
    advance();
  };

  function string() {
    expect('"');
    let out = '';
    while (true) {
      const c = text[i];
      if (c === undefined) fail('a string is never closed');
      if (c === '"') { advance(); return out; }
      if (c === '\n') fail('a string runs onto the next line');
      if (c === '\\') {
        advance();
        const e = text[i];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e in map) { out += map[e]; advance(); continue; }
        if (e === 'u') {
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('a \\u escape needs four hex digits');
          out += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 5; k++) advance();
          continue;
        }
        fail(`"\\${e}" isn't a JSON escape`);
      }
      if (c < ' ') fail('control characters must be escaped in strings');
      out += c;
      advance();
    }
  }

  function number() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match) fail(`unexpected "${text[i]}"`);
    for (let k = 0; k < match[0].length; k++) advance();
    return Number(match[0]);
  }

  function literal(word, value) {
    if (text.slice(i, i + word.length) !== word) fail(`unexpected "${text[i]}"`);
    for (let k = 0; k < word.length; k++) advance();
    return value;
  }

  function value(path) {
    space();
    positions.set(path, here());
    const c = text[i];
    if (c === '{') return object(path);
    if (c === '[') return array(path);
    if (c === '"') return string();
    if (c === 't') return literal('true', true);
    if (c === 'f') return literal('false', false);
    if (c === 'n') return literal('null', null);
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    if (c === undefined) fail('the file ended where a value was expected');
    if (c === "'") fail('JSON strings use double quotes');
    return fail(`unexpected "${c}"`);
  }

  function object(path) {
    expect('{');
    const out = {};
    space();
    if (text[i] === '}') { advance(); return out; }
    while (true) {
      space();
      if (text[i] === '}') fail('remove the comma before "}"');
      if (text[i] === "'") fail('JSON strings use double quotes');
      if (text[i] !== '"') fail(text[i] === undefined ? 'the file ended inside an object' : 'property names need double quotes');
      const keyAt = here();
      const key = string();
      const child = path ? `${path}.${key}` : key;
      positions.set(`key:${child}`, keyAt);
      space();
      expect(':');
      out[key] = value(child);
      space();
      if (text[i] === ',') { advance(); continue; }
      if (text[i] === '}') { advance(); return out; }
      fail(text[i] === '"' ? 'a comma is missing between properties' : `expected "," or "}" but found "${text[i] ?? 'the end'}"`);
    }
  }

  function array(path) {
    expect('[');
    const out = [];
    space();
    if (text[i] === ']') { advance(); return out; }
    while (true) {
      space();
      if (text[i] === ']') fail('remove the comma before "]"');
      out.push(value(`${path}[${out.length}]`));
      space();
      if (text[i] === ',') { advance(); continue; }
      if (text[i] === ']') { advance(); return out; }
      fail(`expected "," or "]" but found "${text[i] ?? 'the end'}"`);
    }
  }

  if (text.charCodeAt(0) === 0xfeff) i = 1; // byte order mark
  const result = value('');
  space();
  if (i < text.length) fail('there is more text after the package');
  return { value: result, positions };
}

/** The best position for a validator path: the value, else its property name, else the nearest parent that exists. */
export function positionOf(positions, path) {
  let current = path;
  while (true) {
    const found = positions.get(current) ?? positions.get(`key:${current}`);
    if (found) return found;
    if (current === '') return { line: 1, column: 1 };
    const cut = Math.max(current.lastIndexOf('.'), current.lastIndexOf('['));
    current = cut <= 0 ? '' : current.slice(0, cut);
  }
}
