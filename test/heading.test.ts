import assert from 'assert';
import {headingLevel, headingTag} from '../src/heading';

assert.strictEqual(headingTag(1), 'h1');
assert.strictEqual(headingTag(2), 'h2');
assert.strictEqual(headingTag(3), 'h3');
assert.strictEqual(headingTag(6), 'h6');
assert.strictEqual(headingTag(0), 'h1');
assert.strictEqual(headingTag(9), 'h6');
assert.strictEqual(headingLevel(undefined, '### fallback'), 3);
assert.strictEqual(headingTag(undefined, '## fallback'), 'h2');

console.log('heading levels pass');
