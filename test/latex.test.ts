import assert from 'assert';
import {normalizeQuotedLatex} from '../src/latex';

assert.strictEqual(
    normalizeQuotedLatex('\n> x^2 + y^2\\\\\n> = z^2\n> '),
    '\nx^2 + y^2\\\\\n= z^2\n'
);
assert.strictEqual(normalizeQuotedLatex('a > b'), 'a > b');

console.log('quoted latex normalization pass');
