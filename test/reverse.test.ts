import assert from 'assert';
import {biliHtmlToMarkdown} from '../src/reverse';

const html = `
<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<p><strong>bold</strong> <em>italic</em> <del>deleted</del></p>
<p>Before <img data-type="latex" data-formula="x^2+y^2"> after.</p>
<p><img data-type="latex" data-formula="E=mc^2"></p>
<p>Legacy <img type="latex" alt="%5Cfrac%7B1%7D%7B2%7D"> formula.</p>
<p>Published <img class="latex" src="//api.bilibili.com/x/web-frontend/mathjax/tex?formula=%5Csqrt%7Bx%7D"> formula.</p>
<ul><li>first</li><li><a href="https://example.com">second</a></li></ul>
<p><span class="color-pink-03">【external】</span><span class="color-blue-02">https://example.org/docs</span></p>
<p><span class="color-pink-03">inlineCode</span></p>
<hr>
<figure class="img-box"><img src="https://example.com/image.png" alt="fallback"><figcaption>caption</figcaption></figure>
<div class="opus-para-pic center"><div><img src="//i0.hdslb.com/bfs/new_dyn/photo.png@1192w"></div><div class="opus-pic-view__caption">published caption</div></div>
<figure class="code-box"><pre class="language-python"><code>print(1)</code></pre></figure>
<table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>
`;

const markdown = biliHtmlToMarkdown(html);

assert.ok(markdown.includes('# Heading 1'));
assert.ok(markdown.includes('## Heading 2'));
assert.ok(markdown.includes('### Heading 3'));
assert.ok(markdown.includes('**bold**'));
assert.ok(markdown.includes('*italic*'));
assert.ok(markdown.includes('~deleted~'));
assert.ok(markdown.includes('Before $x^2+y^2$ after.'));
assert.ok(markdown.includes('$$\nE=mc^2\n$$'));
assert.ok(markdown.includes('Legacy $\\frac{1}{2}$ formula.'));
assert.ok(markdown.includes('Published $\\sqrt{x}$ formula.'));
assert.ok(markdown.includes('-   first'));
assert.ok(markdown.includes('[second](https://example.com)'));
assert.ok(markdown.includes('[external](https://example.org/docs)'));
assert.ok(markdown.includes('`inlineCode`'));
assert.ok(markdown.includes('---'));
assert.ok(markdown.includes('![caption](https://example.com/image.png)'));
assert.ok(markdown.includes('![published caption](https://i0.hdslb.com/bfs/new_dyn/photo.png)'));
assert.ok(markdown.includes('```python\nprint(1)\n```'));
assert.ok(markdown.includes('| Column |'));
assert.ok(!markdown.includes('data-formula'));
assert.ok(!markdown.includes('type="latex"'));

console.log(markdown);
