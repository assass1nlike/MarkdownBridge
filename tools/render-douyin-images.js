/*
 * Render a Markdown document to 3:4 JPEG pages locally. This never opens or
 * interacts with Douyin; the generated files are intended for its normal
 * "publish images" upload control.
 */
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const {execFileSync} = require('child_process');
const marked = require('marked');
const {chromium} = require('playwright');

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
    const entries = [];
    const prefix = `MD4DY_${Date.now()}_`;
    const stash = (tex, display) => `${prefix}${entries.push({tex: tex.trim(), display}) - 1}END`;
    const replace = text => {
        let out = '';
        for (let i = 0; i < text.length;) {
            const open = text.startsWith('$$', i) ? '$$' : text.startsWith('\\[', i) ? '\\[' : '';
            if (open) {
                const close = open === '$$' ? '$$' : '\\]';
                const end = text.indexOf(close, i + 2);
                if (end >= 0) { out += `\n\n${stash(text.slice(i + 2, end), true)}\n\n`; i = end + 2; continue; }
            }
            if (text.startsWith('\\(', i)) {
                const end = text.indexOf('\\)', i + 2);
                if (end >= 0) { out += stash(text.slice(i + 2, end), false); i = end + 2; continue; }
            }
            if (text[i] === '$' && text[i - 1] !== '\\' && text[i - 1] !== '$' && text[i + 1] !== '$') {
                let end = i + 1;
                while ((end = text.indexOf('$', end)) >= 0 && (text[end - 1] === '\\' || text[end + 1] === '$' || text.slice(i + 1, end).includes('\n'))) end += 1;
                if (end > i + 1) { out += stash(text.slice(i + 1, end), false); i = end + 1; continue; }
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
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#24292f}.page{width:${WIDTH}px;padding:88px 88px 96px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;font-size:30px;line-height:1.75;word-break:break-word}.content{width:100%}h1{font-size:56px;line-height:1.25;margin:0 0 42px;font-weight:750;border-bottom:2px solid #eaecef;padding-bottom:22px}h2{font-size:44px;line-height:1.3;margin:52px 0 22px}h3{font-size:36px;line-height:1.35;margin:40px 0 18px}h4,h5,h6{font-size:32px;margin:30px 0 14px}p{margin:0 0 22px}blockquote{margin:24px 0;padding:8px 24px;border-left:6px solid #c9d1d9;color:#57606a;background:#f6f8fa}pre{margin:24px 0;padding:22px 26px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;font:24px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}code{font:26px ui-monospace,SFMono-Regular,Consolas,monospace;background:#f6f8fa;padding:2px 7px;border-radius:5px}pre code{padding:0;background:transparent}ul,ol{margin:0 0 22px;padding-left:48px}li{margin:6px 0}hr{border:0;border-top:3px solid #d0d7de;margin:42px 0}table{border-collapse:collapse;width:100%;margin:26px 0;font-size:26px}th,td{border:1px solid #d0d7de;padding:10px 14px}th{background:#f6f8fa}img{display:block;max-width:100%;height:auto;margin:24px auto;border-radius:6px}.math-block{text-align:center;margin:30px 0;overflow:hidden}.math-inline{white-space:nowrap}.math-block .katex{max-width:100%;font-size:1em}.math-block .katex-display{margin:0}.math-block .katex{display:inline-block}
</style></head><body><main class="page"><article class="content">${rendered.html}</article></main><script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script><script>for(const node of document.querySelectorAll('[data-math]')){const item=JSON.parse(atob(node.dataset.math));node.innerHTML=katex.renderToString(item.tex,{displayMode:item.display,throwOnError:false,strict:false,output:'htmlAndMathml'});const formula=node.querySelector('.katex');if(item.display&&formula&&formula.getBoundingClientRect().width>node.clientWidth){const scale=Math.max(.35,node.clientWidth/formula.getBoundingClientRect().width);formula.style.transformOrigin='center top';formula.style.transform='scale('+scale+')';node.style.height=Math.ceil(formula.getBoundingClientRect().height*scale+8)+'px';}}</script></body></html>`;
}

async function main() {
    const input = process.argv[2];
    if (!input) usage();
    const absoluteInput = path.resolve(input);
    const output = path.resolve(process.argv[3] || path.join(path.dirname(absoluteInput), `${path.basename(absoluteInput, path.extname(absoluteInput))}-douyin-images`));
    if (!fs.existsSync(absoluteInput)) throw new Error(`Markdown file not found: ${absoluteInput}`);
    fs.mkdirSync(output, {recursive: true});
    for (const name of fs.readdirSync(output)) {
        if (/^page-\d+\.jpg$/i.test(name)) fs.unlinkSync(path.join(output, name));
    }
    const htmlPath = path.join(output, 'render.html');
    fs.writeFileSync(htmlPath, documentHtml(fs.readFileSync(absoluteInput, 'utf8')), 'utf8');
    const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await chromium.launch({headless: true, executablePath: chrome});
    try {
        const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}, deviceScaleFactor: 1});
        await page.goto(pathToFileURL(htmlPath).href, {waitUntil: 'networkidle'});
        await page.evaluate(() => document.fonts.ready);
        const bodyHeight = await page.locator('.page').evaluate(element => Math.ceil(element.getBoundingClientRect().height));
        const pages = Math.ceil(bodyHeight / HEIGHT);
        if (pages > MAX_IMAGES) throw new Error(`Would generate ${pages} images; limit is ${MAX_IMAGES}. Split the Markdown document first.`);
        const paddedHeight = pages * HEIGHT;
        await page.setViewportSize({width: WIDTH, height: paddedHeight});
        await page.evaluate(height => { document.body.style.minHeight = `${height}px`; }, paddedHeight);
        for (let index = 0; index < pages; index += 1) {
            await page.screenshot({path: path.join(output, `page-${String(index + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 92, clip: {x: 0, y: index * HEIGHT, width: WIDTH, height: HEIGHT}});
        }
        const title = (fs.readFileSync(absoluteInput, 'utf8').match(/^#\s+(.+)$/m) || [])[1] || '';
        fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({input: absoluteInput, title, width: WIDTH, height: HEIGHT, pages, formulas: mathHtml(fs.readFileSync(absoluteInput, 'utf8')).formulas}, null, 2));
        console.log(JSON.stringify({output, pages, width: WIDTH, height: HEIGHT}));
    } finally { await browser.close(); }
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
