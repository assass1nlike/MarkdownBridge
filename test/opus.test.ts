import assert from 'assert';
import {opusToMarkdown} from '../src/opus';

const markdown = opusToMarkdown(`
<p>Published article</p>
<h2>Section</h2>
<p><strong>bold</strong> and <img data-type="latex" data-formula="x^2"></p>
`, 'Public title');

assert.ok(markdown.startsWith('# Public title\n\nPublished article'));
assert.ok(markdown.includes('## Section'));
assert.ok(markdown.includes('**bold** and $x^2$'));

console.log(markdown);
