const {test} = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const {chromium} = require('playwright');
const {mathHtml, buildSemanticPages} = require('../tools/render-douyin-images');
const {layoutDisplayMath} = require('../tools/layout-math');
const {pathToFileURL} = require('node:url');

function formulas(html) {
    return [...html.matchAll(/data-math="([^"]+)"/g)].map(match =>
        JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')));
}

test('inline math spans soft source breaks without corrupting following formulas or prose', () => {
    const tex = String.raw`\pi_{\theta_t}\left(\boldsymbol{x}_o\right)
=\operatorname{Softmax}\left(\boldsymbol{z}^{t}\left(\boldsymbol{x}_o\right)\right)`;
    for (const newline of ['\n', '\r\n']) {
        for (const [open, close] of [['$', '$'], ['\\(', '\\)']]) {
            for (const quote of ['', '> ', '> > ']) {
                const input = `${quote}记分布 ${open}${tex.replace(/\n/g, '\n' + quote)}${close}，并令 $\\delta_{ij}$ 在 $i=j$ 时为 $1$、否则为 $0$。`;
                const result = mathHtml(input.replace(/\n/g, newline));
                assert.deepEqual(formulas(result.html), [tex, '\\delta_{ij}', 'i=j', '1', '0'].map(tex => ({tex, display: false})));
                assert.match(result.html, /，并令/);
                assert.doesNotMatch(result.html, /<em>|MD4DY_|\$/);
                for (const item of formulas(result.html)) assert.doesNotThrow(() => katex.renderToString(item.tex, {throwOnError: true}));
            }
        }
    }
    // Newlines also terminate TeX comments; replacing them with spaces changes the math.
    const comment = 'x % comment\n= y';
    assert.equal(formulas(mathHtml(`$${comment}$`).html)[0].tex, comment);
});

test('unmatched inline math stays within paragraph and block boundaries', () => {
    for (const boundary of ['\n\n', '\n# 标题 ', '\n- 项目 ', '\n1. 项目 ', '\n> 引用 ', '\n---\n', '\n===\n', '\n```text\n代码\n```\n']) {
        for (const [open, close] of [['$', '$'], ['\\(', '\\)']]) {
            const result = mathHtml(`${open}unfinished${boundary}$y$ 后文 ${close}`);
            assert.deepEqual(formulas(result.html), [{tex: 'y', display: false}], boundary);
        }
    }
    for (const input of [
        '> $unfinished\n>\n> $y$',
        '> $unfinished\n外部 $y$',
        '$unfinished $$z$$ 后文 $y$',
        '$unfinished \\[z\\] 后文 $y$',
        '$unfinished 后文 $y$',
        '$unfinished `code` 后文 $y$',
    ]) {
        const result = formulas(mathHtml(input).html);
        assert.equal(result.at(-1).tex, 'y', input);
        assert.ok(result.every(item => ['y', 'z'].includes(item.tex)), input);
    }
    assert.deepEqual(formulas(mathHtml(String.raw`转义 \$5；$x+\$1$；$a\\$；$y$；` + '`$z$`').html), [
        {tex: String.raw`x+\$1`, display: false}, {tex: String.raw`a\\`, display: false}, {tex: 'y', display: false},
    ]);
});

test('quote prefixes are removed at the opening depth; mathematical > signs remain', () => {
    for (const [open, close] of [['$$', '$$'], ['\\[', '\\]']]) {
        for (const quote of ['> ', '> > ', '>> ', '  > ']) {
            const tex = '\\begin{aligned}\nx &> y \\\\\n> 0\n\\end{aligned}';
            const input = `${quote}${open}\n${tex.split('\n').map(line => quote + line).join('\n')}\n${quote}${close}`;
            const result = mathHtml(input);
            assert.equal(result.formulas, 1);
            assert.deepEqual(formulas(result.html), [{tex, display: true}]);
            assert.doesNotThrow(() => katex.renderToString(tex, {displayMode: true, throwOnError: true}));
        }
    }
    assert.equal(formulas(mathHtml('$$\nx\n> y\n$$').html)[0].tex, 'x\n> y');
});

test('pagination threshold splits complete math lines without losing content or cutting fractions/matrices', async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
    try {
        const page = await browser.newPage();
        const css = pathToFileURL(require.resolve('katex/dist/katex.min.css')).href;
        await page.goto(css);
        const setup = async (tex, lead = 270) => {
            await page.setContent(`<link rel="stylesheet" href="${css}"><style>
                *{box-sizing:border-box}body{margin:0;font:30px Arial}
                .page{width:700px;padding:30px}.export-page{height:600px;overflow:hidden}
                .content{width:100%}.math-block{margin:20px 0;text-align:center}
                .math-block .katex{font-size:1em;display:inline-block}.katex-display{margin:0}
                </style><main class="page source-page"><article class="content">
                <div style="height:${lead}px">前文</div>
                <div class="math-block" data-math="${Buffer.from(JSON.stringify({tex})).toString('base64')}">${katex.renderToString(tex, {displayMode: true})}</div>
                <p>后文</p></article></main>`);
            await page.evaluate(() => document.fonts.ready);
            await layoutDisplayMath(page);
            return page.locator('.source-page .math-block').evaluate(block => ({
                height: block.getBoundingClientRect().height,
                atomic: block.dataset.atomicMath,
                wrapped: block.dataset.wrapMath,
                // These objects must remain entirely inside a single fragment.
                fractions: [...block.querySelectorAll('.mfrac, [data-mml-node="mfrac"]')].map(el => {
                    const r = el.getBoundingClientRect(), b = block.getBoundingClientRect();
                    return [r.top - b.top, r.bottom - b.top];
                }),
            }));
        };
        const aligned = String.raw`\begin{aligned}` + Array(9).fill(String.raw`a&=\frac{x^2+1}{y^2+1}`).join(String.raw`\\`) + String.raw`\end{aligned}`;
        const sum = Array(22).fill('x_i^2').join('+');
        const wrapped = String.raw`\begin{aligned}a&=${sum}\\b&=${sum}\\c&=${sum}\end{aligned}`;
        for (const tex of [aligned, wrapped]) {
            const original = await setup(tex);
            if (tex === wrapped) assert.equal(original.wrapped, 'true');
            await buildSemanticPages(page, 0.25);
            assert.ok(await page.locator('.export-page').first().locator('.math-fragment').count(), 'use the previous page when blank space exceeds threshold: ' + JSON.stringify(original));
            const slices = await page.locator('.math-fragment').evaluateAll(nodes => nodes.map(n => ({
                start: Number(n.dataset.sliceStart), end: Number(n.dataset.sliceEnd),
                bottom: n.getBoundingClientRect().bottom,
                limit: n.closest('.export-page').getBoundingClientRect().bottom - 30,
            })));
            assert.ok(slices.length >= 2);
            assert.equal(slices[0].start, 0);
            assert.equal(slices[slices.length - 1].end, original.height);
            slices.forEach((slice, i) => {
                if (i) assert.equal(slice.start, slices[i - 1].end, 'no gaps or duplicate content');
                assert.ok(slice.bottom <= slice.limit + 1, 'fragment fits page');
            });
            for (const [top, bottom] of original.fractions) assert.ok(slices.some(s => s.start <= top && s.end >= bottom), 'fraction stays intact');
            assert.equal(await page.locator('.export-page p').filter({hasText: '后文'}).count(), 1);
        }
        await setup(aligned);
        await buildSemanticPages(page, 1);
        assert.equal(await page.locator('.math-fragment').count(), 0, 'threshold 1 disables splitting');
        assert.equal(await page.locator('.export-page').first().locator('.math-block').count(), 0);

        const sixRows = String.raw`\begin{aligned}` + Array(6).fill(String.raw`a&=\frac{x^2+1}{y^2+1}`).join(String.raw`\\`) + String.raw`\end{aligned}`;
        await setup(sixRows);
        await buildSemanticPages(page, 0.6);
        assert.equal(await page.locator('.math-fragment').count(), 0, '50% blank space is below the 60% threshold');
        await setup(sixRows, 0);
        await buildSemanticPages(page, 0);
        assert.equal(await page.locator('.math-fragment').count(), 0, 'a formula that fits is never split');

        const tall = String.raw`\begin{aligned}` + Array(24).fill(String.raw`a&=\frac{x^2+1}{y^2+1}`).join(String.raw`\\`) + String.raw`\end{aligned}`;
        await setup(tall);
        await buildSemanticPages(page, 0.25);
        assert.ok(await page.locator('.math-fragment').count() >= 3, 'very tall aligned formulas span multiple pages');

        for (const env of ['bmatrix', 'matrix']) {
            const matrix = String.raw`\begin{${env}}` + Array(9).fill('a&b').join(String.raw`\\`) + String.raw`\end{${env}}`;
            const original = await setup(matrix);
            assert.equal(original.atomic, 'true');
            await buildSemanticPages(page, 0);
            assert.equal(await page.locator('.math-fragment').count(), 0, 'matrices are never cut');
        }
        await assert.rejects(buildSemanticPages(page, 1.1), /MATH_SPLIT_THRESHOLD/);
    } finally { await browser.close(); }
});

test('inline formulas, code, and text between separate quoted formulas are preserved', () => {
    const result = mathHtml('> 行内 $a>b$ 和 \\(c>d\\)。\n>\n> $$\n> x>0\n> $$\n>\n> 中间文字\n>\n> $$\n> y>0\n> $$\n\n外部文字\n\n> ```tex\n> $$literal$$\n> ```');
    assert.deepEqual(formulas(result.html), [
        {tex: 'a>b', display: false}, {tex: 'c>d', display: false},
        {tex: 'x>0', display: true}, {tex: 'y>0', display: true},
    ]);
    assert.match(result.html, /中间文字/);
    assert.match(result.html, /<code[^>]*>\$\$literal\$\$/);
    assert.doesNotMatch(result.html, /MD4DY_/);
});

test('browser DOM retains formulas and adjacent paragraphs inside their quote containers', async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
    try {
        const page = await browser.newPage();
        const input = '> 引用前文\n>\n> $$\n> x>0\n> $$\n>\n> 引用后文\n\n外部文字\n\n> > 嵌套引用\n> > \\[\n> > y>0\n> > \\]';
        await page.setContent(mathHtml(input).html);
        assert.deepEqual(await page.locator('.math-block').evaluateAll(nodes => nodes.map(node => {
            let depth = 0;
            for (let p = node.parentElement; p; p = p.parentElement) if (p.tagName === 'BLOCKQUOTE') depth++;
            return depth;
        })), [1, 2]);
        const firstQuote = page.locator('body > blockquote').first();
        assert.match(await firstQuote.innerText(), /引用前文[\s\S]*引用后文/);
        assert.equal(await page.locator('body > p').filter({hasText: '外部文字'}).count(), 1);
    } finally {
        await browser.close();
    }
});

test('long formulas wrap offline above the font floor, preserving aligned rows and tags', async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
    try {
        const page = await browser.newPage();
        const network = [];
        await page.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
        const css = pathToFileURL(require.resolve('katex/dist/katex.min.css')).href;
        // A local document origin also lets MathJax load its local components.
        await page.goto(css);
        const sum = Array(35).fill('x_i^2').join(' + ');
        const aligned = String.raw`\begin{aligned}a-b&=${sum}\\&\le ${sum}\end{aligned}\tag{7}`;
        const norms = Array(8).fill(String.raw`\|x-y\|^2`).join(' + ');
        const examples = ['x=1', Array(12).fill('x').join('+'), sum, aligned, norms];
        const html = examples.map((tex, i) => `<div class="math-block" id="m${i}" data-math="${Buffer.from(JSON.stringify({tex})).toString('base64')}">${katex.renderToString(tex, {displayMode: true})}</div>`).join('');
        const content = `<link rel="stylesheet" href="${css}"><style>body{font-size:30px}.math-block{width:600px;text-align:center;margin:24px}.math-block .katex{font-size:1em;display:inline-block}.katex-display{margin:0}</style>${html}`;
        for (const floor of [24, 28]) {
            await page.setContent(content);
            await page.evaluate(() => document.fonts.ready);
            const result = await layoutDisplayMath(page, floor);
            assert.ok(result.wrappedFormulas >= 2);
            assert.equal(await page.locator('#m0 .katex').count(), 1, 'short formulas stay in KaTeX');
            assert.equal(await page.locator('#m0 .katex').evaluate(el => parseFloat(getComputedStyle(el).fontSize)), 30);
            const stats = await page.locator('.math-block').evaluateAll(blocks => blocks.map(block => {
                const formula = block.querySelector('.katex, mjx-container');
                const box = block.getBoundingClientRect();
                const svg = block.querySelector('mjx-container > svg');
                const ink = svg?.querySelector(':scope > g').getBoundingClientRect();
                return {size: parseFloat(getComputedStyle(formula).fontSize), height: formula.getBoundingClientRect().height,
                    fits: !ink || (ink.left >= box.left - 1 && ink.right <= box.right + 1),
                    hasSvg: !!svg};
            }));
            assert.ok(stats.every(s => s.size >= floor && s.fits), JSON.stringify(stats));
            assert.ok(stats[2].hasSvg && stats[2].height > 80, 'sum must occupy multiple lines');
            assert.ok(stats[3].hasSvg && stats[3].height > stats[2].height, 'aligned rows remain separate');
            assert.equal(await page.locator('#m3 [data-mml-node="merror"]').count(), 0);
            assert.ok(await page.locator('#m3 [data-mml-node="mlabeledtr"]').count(), 'equation tag is retained');
            const bars = await page.locator('#m4 use[data-c="2225"], #m4 use[data-c="2016"]').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().y));
            assert.equal(bars.length, 16, 'all norm delimiters are retained');
            for (let i = 0; i < bars.length; i += 2) assert.ok(Math.abs(bars[i] - bars[i + 1]) < 1, 'norms must not split across lines');
        }
        assert.deepEqual(network, [], 'math components and fonts must not need the network');

        await page.setContent(`<link rel="stylesheet" href="${css}"><div class="math-block" style="width:600px;font-size:30px" data-math="${Buffer.from(JSON.stringify({tex: String.raw`\rule{100em}{1em}`})).toString('base64')}">${katex.renderToString(String.raw`\rule{100em}{1em}`, {displayMode: true})}</div>`);
        await page.evaluate(() => document.fonts.ready);
        await assert.rejects(layoutDisplayMath(page, 24), /无法安全自动换行/);
        await assert.rejects(layoutDisplayMath(page, 0), /MATH_MIN_FONT_SIZE/);
    } finally {
        await browser.close();
    }
});

test('wide derivations stack the initial left-hand side only after normal fitting fails', async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
    try {
        const page = await browser.newPage();
        const css = pathToFileURL(require.resolve('katex/dist/katex.min.css')).href;
        await page.goto(css);
        const setFormula = async tex => {
            await page.setContent(`<link rel="stylesheet" href="${css}"><style>
                body{font:30px Arial}.math-block{width:600px;text-align:center}
                .math-block .katex{font-size:1em;display:inline-block}.katex-display{margin:0}
                </style><div class="math-block" data-math="${Buffer.from(JSON.stringify({tex})).toString('base64')}">${katex.renderToString(tex, {displayMode:true})}</div>`);
            await page.evaluate(() => document.fonts.ready);
        };
        const tex = String.raw`\begin{aligned}a+b+c+d+e+f+g+h+i+j+k+l&=\rule{14em}{0.6em}\\&\le\rule{12em}{0.6em}\end{aligned}\tag{9}`;
        await setFormula(tex);
        const source = await page.locator('.math-block').getAttribute('data-math');
        await layoutDisplayMath(page);
        assert.equal(await page.locator('[data-stacked-math]').count(), 1);
        assert.equal(await page.locator('.math-block').getAttribute('data-math'), source, 'original TeX remains unchanged');
        const result = await page.locator('.math-block').evaluate(block => {
            const svg = block.querySelector('svg');
            const table = [...svg.querySelectorAll('[data-mml-node="mtable"]')].find(t => t.querySelectorAll(':scope > [data-mml-node="mtr"]').length === 3);
            const rows = [...table.querySelectorAll(':scope > [data-mml-node="mtr"]')];
            return {
                size:parseFloat(getComputedStyle(block).fontSize), width:svg.getBoundingClientRect().width,
                leftEmpty:rows.every(row => row.querySelector('[data-mml-node="mtd"]').getBoundingClientRect().width === 0),
                ys: rows.map(row => row.getBoundingClientRect().top),
                xs: rows.map(row => row.getBoundingClientRect().left),
                tags: svg.querySelectorAll('[data-mml-node="mlabeledtr"]').length,
            };
        });
        assert.ok(result.size >= 24 && result.width <= 601, JSON.stringify(result));
        assert.ok(result.leftEmpty && result.ys[0] < result.ys[1] && result.ys[1] < result.ys[2], 'left-hand side gets its own first row');
        // Relation symbols have math spacing; a right-aligned heading would
        // instead be displaced by the unused width of the entire column.
        assert.ok(Math.abs(result.xs[0] - result.xs[1]) < result.size / 2, 'standalone left-hand side aligns with following equations: ' + JSON.stringify(result));
        assert.equal(result.tags, 1, 'tag remains attached to the derivation');

        await setFormula(String.raw`\begin{aligned}a&=b+c\\&=d\end{aligned}`);
        await layoutDisplayMath(page);
        assert.equal(await page.locator('[data-stacked-math]').count(), 0, 'short derivations retain normal alignment');
        await setFormula(String.raw`\begin{aligned}a+b+c+d+e+f&=\rule{20em}{0.6em}\\u+v+w+x+y+z&=\rule{20em}{0.6em}\end{aligned}`);
        await assert.rejects(layoutDisplayMath(page), /无法安全自动换行/, 'independent equations must not be treated as one derivation');
        assert.equal(await page.locator('[data-stacked-math]').count(), 0);
    } finally { await browser.close(); }
});
