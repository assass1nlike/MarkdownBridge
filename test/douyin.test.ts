import assert from 'assert';
import {douyinMarkdownToHtml} from '../src/douyin-markdown';

const result = douyinMarkdownToHtml([
    '# 一级标题',
    '## 二级标题',
    '',
    '**粗体** *斜体*',
    '',
    '$x^2$',
    '',
    '$$',
    'E = mc^2',
    '$$',
    '',
    '```text',
    '$not-math$',
    '```'
].join('\n'));

assert(result.html.includes('<h1>一级标题</h1>'));
assert(result.html.includes('<h2>二级标题</h2>'));
assert(result.html.includes('<img'));
assert(result.html.includes('douyin-math-inline'));
assert(result.html.includes('douyin-math-block'));
assert(result.html.includes('douyin-math-block'));
assert(result.formulaCount === 2);
assert(result.imageCount === 2);
const inlineWithText = douyinMarkdownToHtml('before $x$ after');
assert(inlineWithText.html.includes('<p>before </p><img'));
assert(inlineWithText.html.includes('<p> after</p>'));
assert(result.html.includes('$not-math$'));
const quoted = douyinMarkdownToHtml('> $$\n> E=mc^2\n> $$');
assert(quoted.html.includes('douyin-math-block'));
assert(!quoted.html.includes('> E=mc^2'));
const unsafe = douyinMarkdownToHtml('<script>alert(1)</script> [x](javascript:alert(1))');
assert(!unsafe.html.includes('<script>'));
assert(!unsafe.html.includes('<a href="javascript:'));
const many = douyinMarkdownToHtml(Array.from({length: 31}, () => '$x$').join(' '));
assert(many.imageCount === 31);
const withImages = douyinMarkdownToHtml('![a](https://example.com/a.png) ![b](https://example.com/b.png)');
assert(withImages.imageCount === 2);
console.log('douyin tests passed');
