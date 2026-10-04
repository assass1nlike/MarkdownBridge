/*
 * Render a Markdown document to 3:4 JPEG pages locally. This never opens or
 * interacts with Douyin; the generated files are intended for its normal
 * "publish images" upload control.
 */
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const marked = require('marked');
const {chromium} = require('playwright');
const {layoutDisplayMath} = require('./layout-math');

const WIDTH = 1080;
const HEIGHT = 1440;
const MAX_IMAGES = 30;

function usage() {
    console.error('Usage: node tools/render-douyin-images.js <input.md> [output-directory]');
    process.exit(1);
}

function escapeAttribute(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeUrl(value) {
    return /^(?:javascript|data|vbscript):/i.test(value.trim()) ? '' : value.trim();
}

function mathHtml(source) {
    source = source.replace(/\r\n?/g, '\n');
    const entries = [];
    const prefix = `MD4DY_${Date.now()}_`;
    const stash = (tex, display) => `${prefix}${entries.push({tex: tex.trim(), display}) - 1}END`;
    const escaped = (text, index) => {
        let slashes = 0;
        while (text[--index] === '\\') slashes++;
        return slashes % 2 === 1;
    };
    const inlineMath = (text, start, open, close) => {
        let pos = start + open.length, tex = '';
        if (open === '$' && /\s/.test(text[pos] || ' ')) return null;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const quote = (text.slice(lineStart, start).match(/^ {0,3}(?:>[ \t]?)+/) || [''])[0];
        const depth = (quote.match(/>/g) || []).length;
        for (; pos < text.length; pos++) {
            if (!escaped(text, pos)) {
                // A display delimiter is a boundary, never half of an inline pair.
                if (text.startsWith('$$', pos) || text.startsWith('\\[', pos)) return null;
                if (text.startsWith(close, pos)) {
                    // Do not steal a later formula's opening dollar after an unmatched one.
                    if (!tex.trim() || (open === '$' && /\s/.test(text[pos - 1]))) return null;
                    return {tex, end: pos + close.length};
                }
            }
            if (text[pos] === '\n') {
                let next = pos + 1;
                for (let level = 0; level < depth; level++) {
                    const marker = text.slice(next).match(/^ {0,3}>[ \t]?/);
                    if (!marker) return null;
                    next += marker[0].length;
                }
                const line = text.slice(next).split('\n', 1)[0];
                // Soft line breaks are allowed only within the same Markdown paragraph.
                if (!line.trim() || /^ {0,3}(?:>|#{1,6}(?:\s|$)|[-+*]\s|\d+[.)]\s|`{3}|~{3}|(?:-\s*){3,}$|(?:_\s*){3,}$|(?:\*\s*){3,}$|=+\s*$|--+\s*$)/.test(line)) return null;
                // Keep the newline for TeX comments; remove only Markdown quote markers.
                tex += '\n';
                pos = next - 1;
            } else {
                tex += text[pos];
            }
        }
        return null;
    };
    const replace = text => {
        let out = '';
        for (let i = 0; i < text.length;) {
            const open = text.startsWith('$$', i) ? '$$' : text.startsWith('\\[', i) ? '\\[' : '';
            if (open) {
                const close = open === '$$' ? '$$' : '\\]';
                const end = text.indexOf(close, i + 2);
                if (end >= 0) {
                    // Keep Markdown's quote containers around the placeholder,
                    // but remove exactly that quote depth from subsequent TeX lines.
                    const lineStart = text.lastIndexOf('\n', i - 1) + 1;
                    const quote = (text.slice(lineStart, i).match(/^ {0,3}(?:>[ \t]?)+/) || [''])[0];
                    const depth = (quote.match(/>/g) || []).length;
                    const tex = text.slice(i + 2, end).split('\n').map((line, index) => {
                        if (index > 0) {
                            for (let level = 0; level < depth; level++) {
                                const marker = line.match(/^ {0,3}>[ \t]?/);
                                if (!marker) break;
                                line = line.slice(marker[0].length);
                            }
                        }
                        return line;
                    }).join('\n');
                    const separator = quote ? `\n${quote}\n${quote}` : '\n\n';
                    out += `${separator}${stash(tex, true)}${separator}`;
                    i = end + 2;
                    continue;
                }
            }
            if (text.startsWith('\\(', i) && !escaped(text, i)) {
                const match = inlineMath(text, i, '\\(', '\\)');
                if (match) { out += stash(match.tex, false); i = match.end; continue; }
            }
            if (text[i] === '$' && !escaped(text, i) && text[i - 1] !== '$' && text[i + 1] !== '$') {
                const match = inlineMath(text, i, '$', '$');
                if (match) { out += stash(match.tex, false); i = match.end; continue; }
            }
            out += text[i++];
        }
        return out;
    };
    const protectedSource = source.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`)/g)
        .map(part => /^(?:```|~~~|`)/.test(part) ? part : replace(part)).join('');
    const restore = text => text.replace(new RegExp(`${prefix}(\\d+)END`, 'g'), (_all, index) => {
        const item = entries[Number(index)];
        if (!item) return _all;
        const encoded = Buffer.from(JSON.stringify(item)).toString('base64');
        return item.display ? `<div class="math-block" data-math="${encoded}"></div>` : `<span class="math-inline" data-math="${encoded}"></span>`;
    });
    const renderer = new marked.Renderer();
    renderer.heading = (text, level) => `<h${level}>${text}</h${level}>`;
    renderer.image = (href, title, text) => `<img src="${escapeAttribute(safeUrl(href || ''))}" alt="${escapeAttribute(text || title || '')}">`;
    renderer.link = (href, title, text) => `<a href="${escapeAttribute(safeUrl(href || ''))}"${title ? ` title="${escapeAttribute(title)}"` : ''}>${text}</a>`;
    renderer.code = (code, lang) => `<pre><code${lang ? ` class="language-${escapeAttribute(lang)}"` : ''}>${escapeAttribute(code)}</code></pre>`;
    renderer.html = html => escapeAttribute(html);
    renderer.text = restore;
    return {html: restore(marked(protectedSource, {renderer, breaks: true, headerIds: false, sanitize: false})), formulas: entries.length};
}

function documentHtml(markdown) {
    const rendered = mathHtml(markdown.replace(/\r\n?/g, '\n'));
    return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#24292f}.page{width:${WIDTH}px;padding:88px 88px 96px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;font-size:30px;line-height:1.75;word-break:break-word;overflow:hidden}.content{width:100%}h1{font-size:56px;line-height:1.25;margin:0 0 42px;font-weight:750;border-bottom:2px solid #eaecef;padding-bottom:22px}h2{font-size:44px;line-height:1.3;margin:52px 0 22px}h3{font-size:36px;line-height:1.35;margin:40px 0 18px}h4,h5,h6{font-size:32px;margin:30px 0 14px}p{margin:0 0 22px}blockquote{margin:24px 0;padding:8px 24px;border-left:6px solid #c9d1d9;color:#57606a;background:#f6f8fa}pre{margin:24px 0;padding:22px 26px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;font:24px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}code{font:26px ui-monospace,SFMono-Regular,Consolas,monospace;background:#f6f8fa;padding:2px 7px;border-radius:5px}pre code{padding:0;background:transparent}ul,ol{margin:0 0 22px;padding-left:48px}li{margin:6px 0}hr{border:0;border-top:3px solid #d0d7de;margin:42px 0}table{border-collapse:collapse;width:100%;margin:26px 0;font-size:26px}th,td{border:1px solid #d0d7de;padding:10px 14px}th{background:#f6f8fa}img{display:block;max-width:100%;height:auto;margin:24px auto;border-radius:6px}.math-block{text-align:center;margin:30px 0;overflow:visible;max-width:100%}.math-inline{white-space:nowrap}.math-block .katex{max-width:none;font-size:1em;display:inline-block}.math-block .katex-display{margin:0}.export-stage{position:absolute;left:-20000px;top:0;width:${WIDTH}px}.export-page{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;padding:88px 88px 96px;background:#fff}.export-page .math-block,.export-page pre,.export-page table,.export-page img{break-inside:avoid;page-break-inside:avoid}
</style></head><body><main class="page source-page"><article class="content">${rendered.html}</article></main><script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script><script>
for(const node of document.querySelectorAll('[data-math]')) {
    const item = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(node.dataset.math), c => c.charCodeAt(0))));
    node.innerHTML = katex.renderToString(item.tex, {displayMode:item.display, throwOnError:false, strict:false, output:'htmlAndMathml'});
}
</script></body></html>`;
}

// Build fixed-height pages from semantic blocks before taking screenshots. This
// prevents display formulas, images and other blocks from being cut at an
// arbitrary y-coordinate (the old implementation clipped one long page).
async function buildSemanticPages(page, mathSplitThreshold = 0.25) {
    if (!Number.isFinite(mathSplitThreshold) || mathSplitThreshold < 0 || mathSplitThreshold > 1) {
        throw new Error('MATH_SPLIT_THRESHOLD 必须介于 0 和 1 之间。');
    }
    return page.evaluate(threshold => {
        const source = document.querySelector('.source-page');
        const sourceContent = source.querySelector('.content');
        const stage = document.createElement('div');
        stage.className = 'export-stage';
        stage.style.left = '0px';
        stage.style.zIndex = '-1';
        document.body.append(stage);
        const makePage = () => {
            const out = document.createElement('main');
            out.className = 'page export-page';
            const content = document.createElement('article');
            content.className = 'content';
            out.append(content);
            stage.append(out);
            return {out, content};
        };
        const fits = state => state.content.getBoundingClientRect().bottom <=
            state.out.getBoundingClientRect().bottom - parseFloat(getComputedStyle(state.out).paddingBottom) + 1;
        let state = makePage();
        const nextPage = () => (state = makePage());
        // Find empty horizontal bands in the actual typeset formula, protecting
        // fractions, roots and tall delimiters. No TeX is rewritten or reflowed.
        const mathCuts = block => {
            if (block.dataset.atomicMath) return [];
            const bounds = block.getBoundingClientRect();
            const bands = [];
            const add = rect => {
                if (rect.width > 0 && rect.height > 0) bands.push([
                    Math.max(0, rect.top - bounds.top - 0.5), Math.min(bounds.height, rect.bottom - bounds.top + 0.5),
                ]);
            };
            const svg = block.querySelector('mjx-container > svg');
            if (svg) {
                for (const el of svg.querySelectorAll('use, path, rect, line, text, [data-mml-node="mfrac"], [data-mml-node="msqrt"], [data-mml-node="mroot"]')) {
                    if (!el.closest('defs')) add(el.getBoundingClientRect());
                }
            } else {
                const html = block.querySelector('.katex-html');
                if (!html) return [];
                const walker = document.createTreeWalker(html, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    if (!walker.currentNode.textContent.replace(/[\s\u200b\u200c\u200d\u2060\ufeff]/g, '') ||
                        walker.currentNode.parentElement.closest('.vlist-s, .strut, .pstrut')) continue;
                    const range = document.createRange();
                    range.selectNodeContents(walker.currentNode);
                    for (const rect of range.getClientRects()) add(rect);
                }
                for (const el of html.querySelectorAll('svg, .mfrac, .sqrt, .delimsizing, .frac-line, .overline-line')) add(el.getBoundingClientRect());
            }
            bands.sort((a, b) => a[0] - b[0]);
            const merged = [];
            for (const band of bands) {
                if (band[1] <= band[0]) continue;
                const last = merged[merged.length - 1];
                if (last && band[0] <= last[1]) last[1] = Math.max(last[1], band[1]);
                else merged.push(band.slice());
            }
            return merged.slice(1).map((band, i) => (merged[i][1] + band[0]) / 2);
        };
        const appendMath = node => {
            const cuts = mathCuts(node);
            if (!cuts.length) return false;
            const height = node.getBoundingClientRect().height;
            const fragment = (start, end) => {
                const out = node.cloneNode(false);
                out.classList.add('math-fragment');
                out.dataset.sliceStart = start;
                out.dataset.sliceEnd = end;
                const viewport = document.createElement('div');
                viewport.className = 'math-slice-viewport';
                viewport.style.cssText = `height:${end - start}px;overflow:hidden;position:relative`;
                const content = node.cloneNode(true);
                content.classList.remove('math-block');
                content.style.margin = '0';
                content.style.transform = `translateY(-${start}px)`;
                viewport.append(content); out.append(viewport);
                return out;
            };
            let start = 0;
            while (start < height) {
                const sheet = state.out.getBoundingClientRect();
                const style = getComputedStyle(state.out);
                const bottom = sheet.bottom - parseFloat(style.paddingBottom);
                const top = sheet.top + parseFloat(style.paddingTop);
                const occupied = state.content.lastElementChild?.getBoundingClientRect().bottom || top;
                const emptyRatio = (bottom - occupied) / (bottom - top);
                const whole = start === 0 ? node.cloneNode(true) : fragment(start, height);
                state.content.append(whole);
                if (fits(state)) return true;
                whole.remove();
                if (emptyRatio > threshold) {
                    let placed = false;
                    for (const end of [...cuts].reverse().filter(end => end > start)) {
                        const part = fragment(start, end);
                        state.content.append(part);
                        if (fits(state)) { start = end; placed = true; break; }
                        part.remove();
                    }
                    if (placed) {
                        nextPage(); continue;
                    }
                }
                if (!state.content.children.length) {
                    // No safe line fits even on an empty page; the normal
                    // overflow check will report the indivisible tall content.
                    state.content.append(whole); return true;
                }
                nextPage();
            }
            return true;
        };
        const appendNode = node => {
            const clone = node.cloneNode(true);
            state.content.append(clone);
            if (fits(state)) return;
            clone.remove();
            if (node.classList.contains('math-block') && appendMath(node)) return;
            if (!state.content.children.length) { state.content.append(clone); return; }
            nextPage().content.append(node.cloneNode(true));
        };
        const appendList = list => {
            const items = [...list.children].filter(item => item.tagName === 'LI');
            if (!items.length) return appendNode(list);
            let outList = list.cloneNode(false);
            state.content.append(outList);
            if (!fits(state) && state.content.children.length > 1) {
                outList.remove(); nextPage(); outList = list.cloneNode(false); state.content.append(outList);
            }
            items.forEach(item => {
                const clone = item.cloneNode(true); outList.append(clone);
                if (fits(state)) return;
                clone.remove(); nextPage(); outList = list.cloneNode(false); state.content.append(outList); outList.append(item.cloneNode(true));
            });
        };
        const appendTable = table => {
            const head = table.querySelector(':scope > thead');
            const rows = [...table.querySelectorAll(':scope > tbody > tr')];
            if (!rows.length) return appendNode(table);
            const start = () => {
                const outTable = table.cloneNode(false);
                if (head) outTable.append(head.cloneNode(true));
                outTable.append(document.createElement('tbody')); state.content.append(outTable);
                if (!fits(state) && state.content.children.length > 1) { outTable.remove(); nextPage(); return start(); }
                return outTable;
            };
            let outTable = start(); let body = outTable.querySelector('tbody');
            rows.forEach(row => {
                const clone = row.cloneNode(true); body.append(clone);
                if (fits(state)) return;
                clone.remove(); nextPage(); outTable = start(); body = outTable.querySelector('tbody'); body.append(row.cloneNode(true));
            });
        };
        [...sourceContent.childNodes].forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
            const element = node.nodeType === Node.ELEMENT_NODE ? node : Object.assign(document.createElement('p'), {textContent: node.textContent || ''});
            if (element.tagName === 'TABLE') appendTable(element);
            else if (element.tagName === 'UL' || element.tagName === 'OL') appendList(element);
            else appendNode(element);
        });
        source.remove();
        return stage.querySelectorAll('.export-page').length;
    }, mathSplitThreshold);
}

async function renderImages(input, outputDirectory, {scale = 1, maxImages = MAX_IMAGES, minMathFontSize = Number(process.env.MATH_MIN_FONT_SIZE || 24), mathSplitThreshold = Number(process.env.MATH_SPLIT_THRESHOLD || 0.25)} = {}) {
    const absoluteInput = path.resolve(input);
    const output = path.resolve(outputDirectory || path.join(path.dirname(absoluteInput), `${path.basename(absoluteInput, path.extname(absoluteInput))}-douyin-images`));
    if (!fs.existsSync(absoluteInput)) throw new Error(`Markdown file not found: ${absoluteInput}`);
    fs.mkdirSync(output, {recursive: true});
    const htmlPath = path.join(output, 'render.html');
    const markdown = fs.readFileSync(absoluteInput, 'utf8');
    const base = pathToFileURL(path.dirname(absoluteInput) + path.sep).href;
    fs.writeFileSync(htmlPath, documentHtml(markdown).replace('<head>', `<head><base href="${escapeAttribute(base)}">`), 'utf8');
    const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await chromium.launch({headless: true, executablePath: chrome});
    try {
        const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}, deviceScaleFactor: scale});
        // Serve the installed KaTeX assets locally, including fonts; no CDN is required.
        const katexDist = path.dirname(require.resolve('katex/dist/katex.min.js'));
        await page.route('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/**', route => {
            const relative = new URL(route.request().url()).pathname.split('/dist/')[1];
            return route.fulfill({path: path.join(katexDist, relative)});
        });
        await page.goto(pathToFileURL(htmlPath).href, {waitUntil: 'networkidle'});
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => {
            if (document.querySelector('.katex-error')) throw new Error('LaTeX 解析失败，请检查公式。');
            if ([...document.images].some(img => !img.complete || !img.naturalWidth)) throw new Error('文档中的图片未能加载。');
        });
        const mathLayout = await layoutDisplayMath(page, minMathFontSize);
        const pages = await buildSemanticPages(page, mathSplitThreshold);
        if (pages > maxImages) throw new Error(`Would generate ${pages} images; limit is ${maxImages}. Split the Markdown document first.`);
        await page.evaluate(() => {
            for (const [index, sheet] of [...document.querySelectorAll('.export-page')].entries()) {
                const bottom = sheet.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sheet).paddingBottom);
                if (sheet.querySelector('.content').getBoundingClientRect().bottom > bottom + 1 || sheet.scrollWidth > sheet.clientWidth + 1) {
                    throw new Error(`第 ${index + 1} 页内容超出页面，请拆分过长段落、引用或代码块。`);
                }
                for (const block of sheet.querySelectorAll('.math-block')) {
                    const bounds = block.getBoundingClientRect();
                    const formula = block.querySelector('.math-slice-viewport, .katex, mjx-container > svg').getBoundingClientRect();
                    if (formula.left < bounds.left - 1 || formula.right > bounds.right + 1 || formula.bottom > bottom + 1) {
                        throw new Error(`第 ${index + 1} 页公式超出内容区域。`);
                    }
                }
            }
        });
        for (const name of fs.readdirSync(output)) {
            if (/^page-\d+\.jpg$/i.test(name)) fs.unlinkSync(path.join(output, name));
        }
        for (let index = 0; index < pages; index += 1) {
            await page.locator('.export-page').nth(index).screenshot({path: path.join(output, `page-${String(index + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 92});
        }
        const title = (markdown.match(/^#\s+(.+)$/m) || [])[1] || '';
        const images = Array.from({length: pages}, (_, i) => `page-${String(i + 1).padStart(2, '0')}.jpg`);
        const manifest = {input: absoluteInput, title, width: Math.round(WIDTH * scale), height: Math.round(HEIGHT * scale), pages, images, formulas: mathHtml(markdown).formulas, mathLayout, mathSplitThreshold};
        fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
        return {output, ...manifest};
    } finally { await browser.close(); }
}

module.exports = {renderImages, mathHtml, buildSemanticPages};
if (require.main === module) {
    if (!process.argv[2]) usage();
    renderImages(process.argv[2], process.argv[3]).then(result => console.log(JSON.stringify(result)))
        .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
