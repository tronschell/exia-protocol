import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { encodeQR } from '../src/qr.js';

// Draws the code with a quiet zone and reads it back with an independent decoder.
function decode({ size, modules }) {
  const scale = 4;
  const quiet = 4;
  const side = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const p = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
          pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
        }
      }
    }
  }
  return jsQR(pixels, side, side)?.data;
}

const samples = [
  'a',
  'projectexia://add?url=http%3A%2F%2F192.168.1.23%3A8787%2Fexia.json',
  'https://tronschell.github.io/exia-protocol/install/?url=https%3A%2F%2Fexample.github.io%2Fstarter%2Fexia.json',
  'x'.repeat(150),
  'ü'.repeat(120),
  'y'.repeat(400),
];

for (const text of samples) {
  test(`QR round trip: ${text.length} characters`, () => {
    const code = encodeQR(text);
    assert.equal(decode(code), text);
  });
}
