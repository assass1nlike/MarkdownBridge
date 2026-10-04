const path = require('path');
const {pathToFileURL} = require('url');

// KaTeX remains the normal renderer. For very wide expressions, reuse its
// TeX with MathJax 4's structural line breaking (including aligned cells).
async function layoutDisplayMath(page, minFontSize = 24) {
    if (!Number.isFinite(minFontSize) || minFontSize <= 0 || minFontSize > 30) {
        throw new Error('MATH_MIN_FONT_SIZE 必须大于 0 且不超过 30（单位 px）。');
    }
    const count = await page.evaluate(minimum => {
        let count = 0;
        for (const block of document.querySelectorAll('.math-block')) {
            const formula = block.querySelector('.katex');
            if (!formula) throw new Error('KaTeX 未能加载。');
            // Only alignment tables may cross pages. Matrices/arrays (including
            // bare matrices with no tall delimiters) stay intact.
            if ([...block.querySelectorAll('math mtable')].some(table =>
                !/^(?:right left)(?: right left)*$/.test(table.getAttribute('columnalign') || ''))) {
                block.dataset.atomicMath = 'true';
            }
            const base = parseFloat(getComputedStyle(block).fontSize);
            const width = Math.max(formula.scrollWidth, formula.getBoundingClientRect().width);
            const size = Math.min(base, base * (block.clientWidth - 4) / width);
            if (size >= minimum) formula.style.fontSize = `${size}px`;
            else { block.dataset.wrapMath = 'true'; count++; }
        }
        return count;
    }, minFontSize);
    if (!count) return {wrappedFormulas: 0, minFontSize};

    const root = path.dirname(require.resolve('mathjax/package.json'));
    const fontRoot = path.dirname(require.resolve('@mathjax/mathjax-newcm-font/package.json'));
    await page.evaluate(({root, fontRoot}) => {
        window.MathJax = {
            loader: {load: ['input/tex', 'output/svg'], paths: {mathjax: root, 'mathjax-newcm': fontRoot}},
            startup: {typeset: false},
            svg: {font: 'mathjax-newcm', fontCache: 'local', displayOverflow: 'linebreak',
                linebreaks: {inline: false, width: '100%', lineleading: 0.3}},
        };
    }, {root: pathToFileURL(root).href, fontRoot: pathToFileURL(fontRoot).href});
    await page.addScriptTag({url: pathToFileURL(path.join(root, 'startup.js')).href});
    await page.evaluate(async minimum => {
        await MathJax.startup.promise;
        document.head.append(MathJax.svgStylesheet());
        let stackAligned = false;
        let stacked = false;
        // Keep the short left-hand side of an aligned equation intact. Allow
        // MathJax to break the right-hand side, where continuation lines belong.
        MathJax.startup.document.inputJax[0].postFilters.add(({data}) => {
            if (stackAligned) {
                data.root.walkTree(table => {
                    if (table.kind !== 'mtable' || table.attributes.get('columnalign') !== 'right left') return;
                    // Only a single derivation: one initial left-hand side,
                    // then empty left cells and relation-led right cells.
                    const tokens = node => {
                        const out = [];
                        node.walkTree(n => { if (n.isToken && n.kind !== 'mspace' && n.getText().trim()) out.push(n); });
                        return out;
                    };
                    const rows = [...table.childNodes];
                    if (!rows.length || rows.some(row => row.kind !== 'mtr' || row.childNodes.length !== 2) ||
                        !tokens(rows[0].childNodes[0]).length ||
                        rows.slice(1).some(row => tokens(row.childNodes[0]).length) ||
                        rows.some(row => tokens(row.childNodes[1])[0]?.texClass !== 3)) return;
                    const create = (kind, children = []) => data.nodeFactory.create('node', kind, children);
                    const first = rows[0];
                    const left = first.childNodes[0];
                    first.replaceChild(create('mtd'), left);
                    left.attributes.set('columnalign', 'left');
                    const heading = create('mtr', [create('mtd'), left]);
                    table.appendChild(heading);
                    table.childNodes.pop();
                    table.childNodes.unshift(heading);
                    stacked = true;
                });
            }
            // Treat parenthesized terms and norms as units, so a continuation
            // starts between terms rather than inside a norm with a superscript.
            data.root.walkTree(node => {
                if (!node.isInferred && node.kind !== 'mrow') return;
                let depth = 0;
                let norm = false;
                for (const child of node.childNodes) {
                    const operator = child.coreMO();
                    if (operator.kind !== 'mo') continue;
                    const delimiter = ['\u2225', '\u2016'].includes(operator.getText());
                    const open = operator.texClass === 4;
                    const close = operator.texClass === 5;
                    if (delimiter) norm = !norm;
                    if (open) depth++;
                    if (depth || norm || delimiter || close) operator.attributes.set('linebreak', 'nobreak');
                    else if (operator.texClass === 2 || operator.texClass === 3) operator.attributes.set('linebreak', 'goodbreak');
                    if (close) depth = Math.max(0, depth - 1);
                }
            });
            data.root.walkTree(node => {
                if (node.kind !== 'mtable' || node.attributes.get('columnalign') !== 'right left') return;
                for (const row of node.childNodes) {
                    const left = row.childNodes[0];
                    left?.walkTree(child => {
                        if (child.kind === 'mo') child.attributes.set('linebreak', 'nobreak');
                    });
                }
            });
        });
        for (const block of document.querySelectorAll('[data-wrap-math]')) {
            const {tex} = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(block.dataset.math), c => c.charCodeAt(0))));
            const base = parseFloat(getComputedStyle(block).fontSize);
            const width = block.clientWidth - 4;
            // Prefer the original size after wrapping. The floor also applies
            // when an indivisible subexpression needs modest scaling.
            let fits = false;
            for (const mode of [false, true]) {
                stackAligned = mode;
                stacked = false;
                for (const size of [...new Set([base, minimum])]) {
                    block.style.fontSize = `${size}px`;
                    let lineWidth = width;
                    // Aligned columns and tags can add width beyond the requested
                    // line width. Feed back the measured overflow without shrinking text.
                    for (let attempt = 0; attempt < 4; attempt++) {
                        const result = await MathJax.tex2svgPromise(tex, {
                            ...MathJax.getMetricsFor(block, true), containerWidth: lineWidth,
                        });
                        if (mode && !stacked) break;
                        result.style.margin = '0 auto';
                        result.style.width = `${width}px`;
                        block.replaceChildren(result);
                        const svg = result.querySelector('svg');
                        if (!svg || result.querySelector('[data-mml-node="merror"]')) {
                            throw new Error('长公式换行失败，请检查公式。');
                        }
                        const ink = svg.querySelector(':scope > g').getBoundingClientRect();
                        const bounds = block.getBoundingClientRect();
                        const svgBounds = svg.getBoundingClientRect();
                        const actualWidth = Math.max(svgBounds.right - bounds.left, bounds.right - svgBounds.left,
                            ink.right - bounds.left, bounds.right - ink.left);
                        fits = actualWidth <= block.clientWidth + 1;
                        if (fits) break;
                        lineWidth *= (width - 4) / actualWidth;
                    }
                    if (fits || (mode && !stacked)) break;
                }
                if (fits) {
                    if (stacked) block.dataset.stackedMath = 'true';
                    break;
                }
            }
            if (!fits) throw new Error(`公式在最小字号下仍过宽，无法安全自动换行；请手动拆分过长的分式、矩阵或单项。公式：${tex.slice(0, 160)}`);
        }
    }, minFontSize);
    return {wrappedFormulas: count, minFontSize};
}

module.exports = {layoutDisplayMath};
