import marked from 'marked';

interface KatexRuntime { renderToString(tex: string, options?: Record<string, unknown>): string; }
interface Html2CanvasRuntime { (element: HTMLElement, options?: Record<string, unknown>): Promise<HTMLCanvasElement>; }
let katexRuntime: KatexRuntime | null = null;
let html2canvasRuntime: Html2CanvasRuntime | null = null;

const IMAGE_MAX = 30;
const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1440;
const MAX_PAGE_HEIGHT = 2160;
const TOKEN_PREFIX = `MD4DY_MATH_${Date.now()}_`;

async function ensureRenderLibraries(): Promise<void> {
    const scope = globalThis as typeof globalThis & {katex?: KatexRuntime; html2canvas?: Html2CanvasRuntime};
    katexRuntime = scope.katex || null;
    html2canvasRuntime = scope.html2canvas || null;
    if (!katexRuntime || !html2canvasRuntime) throw new Error('无法加载 Markdown 渲染组件，请检查网络后重试');
}

export interface DouyinImageResult {
    files: File[];
    formulaCount: number;
    pageCount: number;
    title: string;
}

interface MathEntry { tex: string; display: boolean; }

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeUrl(value: string): string {
    const url = value.trim();
    return /^(?:javascript|data|vbscript):/i.test(url) ? '' : url;
}

function protectMath(source: string, entries: MathEntry[]): string {
    const stash = (tex: string, display: boolean) => {
        const index = entries.push({tex: tex.trim(), display}) - 1;
        return `${TOKEN_PREFIX}${index}END`;
    };
    const quotePrefixAt = (text: string, position: number): string => {
        const lineStart = text.lastIndexOf('\n', position - 1) + 1;
        return text.slice(lineStart, position).match(/^[ \t]*(?:>[ \t]?)+/)?.[0] || '';
    };
    const stripQuotePrefix = (tex: string) => tex.replace(/^[ \t]*(?:>[ \t]?)+/gm, '').trim();
    const replace = (text: string): string => {
        let result = '';
        let i = 0;
        while (i < text.length) {
            const delimiter = text.startsWith('$$', i) ? '$$' : text.startsWith('\\[', i) ? '\\[' : '';
            if (delimiter) {
                const close = delimiter === '$$' ? '$$' : '\\]';
                const end = text.indexOf(close, i + 2);
                if (end >= 0) {
                    const quote = quotePrefixAt(text, i);
                    const body = text.slice(i + 2, end);
                    result += quote ? `${quote}${stash(stripQuotePrefix(body), true)}` : `\n\n${stash(body, true)}\n\n`;
                    i = end + 2;
                    continue;
                }
            }
            if (text.startsWith('\\(', i)) {
                const end = text.indexOf('\\)', i + 2);
                if (end >= 0) { result += stash(text.slice(i + 2, end), false); i = end + 2; continue; }
            }
            if (text[i] === '$' && text[i - 1] !== '\\' && text[i - 1] !== '$' && text[i + 1] !== '$') {
                let end = i + 1;
                while ((end = text.indexOf('$', end)) >= 0) {
                    if (text[end - 1] !== '\\' && text[end + 1] !== '$' && !text.slice(i + 1, end).includes('\n')) break;
                    end += 1;
                }
                if (end > i + 1) { result += stash(text.slice(i + 1, end), false); i = end + 1; continue; }
            }
            result += text[i++];
        }
        return result;
    };
    return source.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`)/g)
        .map(part => /^(?:```|~~~|`)/.test(part) ? part : replace(part)).join('');
}

function renderMath(value: string, entries: MathEntry[]): string {
    return value.replace(new RegExp(`${TOKEN_PREFIX}(\\d+)END`, 'g'), (_all, index: string) => {
        const item = entries[Number(index)];
        if (!item) return _all;
        const output = katexRuntime!.renderToString(item.tex, {
            displayMode: item.display,
            throwOnError: false,
            strict: false,
            output: 'htmlAndMathml'
        });
        return item.display ? `<div class="md4dy-math-block">${output}</div>` : `<span class="md4dy-math-inline">${output}</span>`;
    });
}

function markdownHtml(source: string): {html: string; formulaCount: number; title: string} {
    const entries: MathEntry[] = [];
    const normalized = source.replace(/\r\n?/g, '\n');
    const protectedSource = protectMath(normalized, entries);
    const renderer = new marked.Renderer();
    renderer.heading = (text: string, level: number) => `<h${level}>${text}</h${level}>`;
    renderer.image = (href: string, title: string | null, text: string) =>
        `<img crossorigin="anonymous" src="${escapeAttribute(safeUrl(href || ''))}" alt="${escapeAttribute(text || title || '')}">`;
    renderer.link = (href: string, title: string | null, text: string) =>
        `<a href="${escapeAttribute(safeUrl(href || ''))}"${title ? ` title="${escapeAttribute(title)}"` : ''}>${text}</a>`;
    renderer.code = (code: string, lang?: string) => `<pre><code${lang ? ` class="language-${escapeAttribute(lang)}"` : ''}>${escapeAttribute(code)}</code></pre>`;
    renderer.html = (html: string) => escapeAttribute(html);
    renderer.text = (text: string) => renderMath(text, entries);
    const html = marked(protectedSource, {renderer, breaks: true, headerIds: false, sanitize: false});
    const titleMatch = normalized.match(/^#\s+(.+)$/m);
    return {html: renderMath(html, entries), formulaCount: entries.length, title: titleMatch?.[1]?.trim() || ''};
}

const STYLE = `
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#24292f}
.md4dy-page{width:${PAGE_WIDTH}px;min-height:${PAGE_HEIGHT}px;padding:88px 88px 96px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;line-height:1.75;overflow:hidden}
.md4dy-content{width:100%;font-size:30px;line-height:1.75;word-break:break-word}
.md4dy-content h1{font-size:56px;line-height:1.25;margin:0 0 42px;font-weight:750;border-bottom:2px solid #eaecef;padding-bottom:22px}
.md4dy-content h2{font-size:44px;line-height:1.3;margin:52px 0 22px;font-weight:700}
.md4dy-content h3{font-size:36px;line-height:1.35;margin:40px 0 18px;font-weight:650}
.md4dy-content h4,.md4dy-content h5,.md4dy-content h6{font-size:32px;margin:30px 0 14px}
.md4dy-content p{margin:0 0 22px}.md4dy-content strong{font-weight:700}.md4dy-content em{font-style:italic}
.md4dy-content blockquote{margin:24px 0;padding:8px 24px;border-left:6px solid #c9d1d9;color:#57606a;background:#f6f8fa}
.md4dy-content pre{margin:24px 0;padding:22px 26px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;font:24px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}
.md4dy-content code{font:26px ui-monospace,SFMono-Regular,Consolas,monospace;background:#f6f8fa;padding:2px 7px;border-radius:5px}
.md4dy-content pre code{padding:0;background:transparent}.md4dy-content ul,.md4dy-content ol{margin:0 0 22px;padding-left:48px}
.md4dy-content li{margin:6px 0}.md4dy-content hr{border:0;border-top:3px solid #d0d7de;margin:42px 0}
.md4dy-content table{border-collapse:collapse;width:100%;margin:26px 0;font-size:26px}.md4dy-content th,.md4dy-content td{border:1px solid #d0d7de;padding:10px 14px}.md4dy-content th{background:#f6f8fa}
.md4dy-content img{display:block;max-width:100%;height:auto;margin:24px auto;border-radius:6px}.md4dy-math-block{text-align:center;margin:30px 0;overflow:hidden}.md4dy-math-inline{white-space:nowrap}
`;

function fitDisplayMath(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.md4dy-math-block').forEach(block => {
        const display = block.querySelector<HTMLElement>('.katex-display');
        const formula = display?.querySelector<HTMLElement>('.katex') || display;
        if (!formula) return;
        const available = block.clientWidth;
        const natural = formula.getBoundingClientRect().width;
        if (!available || natural <= available) return;
        const scale = Math.max(0.35, available / natural);
        const naturalHeight = formula.getBoundingClientRect().height;
        formula.style.transformOrigin = 'center top';
        formula.style.transform = `scale(${scale})`;
        block.style.height = `${Math.ceil(naturalHeight * scale + 8)}px`;
    });
}

function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
    const context = canvas.getContext('2d');
    if (!context) return true;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += 16) {
        for (let x = 0; x < canvas.width; x += 16) {
            const offset = (y * canvas.width + x) * 4;
            if (data[offset] < 245 || data[offset + 1] < 245 || data[offset + 2] < 245) return true;
        }
    }
    return false;
}

function waitForImages(root: HTMLElement): Promise<void> {
    return Promise.all(Array.from(root.querySelectorAll('img')).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), {once: true});
        image.addEventListener('error', () => resolve(), {once: true});
    }))).then(() => undefined);
}

export async function renderMarkdownImages(source: string, onProgress?: (current: number, total: number) => void): Promise<DouyinImageResult> {
    await ensureRenderLibraries();
    const rendered = markdownHtml(source);
    const katexStyle = document.createElement('style');
    katexStyle.textContent = '@import url("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css");';
    document.head.appendChild(katexStyle);
    const root = document.createElement('div');
    root.id = 'markdown4douyin-render-root';
    Object.assign(root.style, {position: 'absolute', left: '-120000px', top: '0', width: `${PAGE_WIDTH}px`, background: '#fff', zIndex: '-1'});
    const style = document.createElement('style');
    style.textContent = STYLE;
    const content = document.createElement('div');
    content.className = 'md4dy-content';
    content.innerHTML = rendered.html;
    const measure = document.createElement('div');
    measure.className = 'md4dy-page';
    measure.style.minHeight = '0';
    measure.appendChild(content);
    root.append(style, measure);
    document.body.appendChild(root);
    try {
        await waitForImages(root);
        const fontSet = (document as Document & {fonts?: {ready: Promise<unknown>}}).fonts;
        if (fontSet?.ready) await fontSet.ready;
        fitDisplayMath(content);
        const totalHeight = Math.max(measure.scrollHeight, measure.getBoundingClientRect().height);
        let pageHeight = PAGE_HEIGHT;
        const needed = Math.ceil(totalHeight / pageHeight);
        if (needed > IMAGE_MAX) pageHeight = Math.min(MAX_PAGE_HEIGHT, Math.ceil(totalHeight / IMAGE_MAX));
        const pages = Math.ceil(totalHeight / pageHeight);
        if (pages > IMAGE_MAX) throw new Error(`渲染后需要 ${pages} 张图片，已超过图文作品的 ${IMAGE_MAX} 张限制；请缩短内容或拆分投稿`);
        const files: File[] = [];
        const viewport = document.createElement('div');
        Object.assign(viewport.style, {width: `${PAGE_WIDTH}px`, height: `${pageHeight}px`, overflow: 'hidden', background: '#fff', position: 'relative'});
        const page = document.createElement('div');
        page.className = 'md4dy-page';
        page.style.minHeight = `${pageHeight}px`;
        page.style.height = `${pageHeight}px`;
        page.appendChild(content.cloneNode(true));
        viewport.appendChild(page);
        root.appendChild(viewport);
        for (let index = 0; index < pages; index += 1) {
            page.style.transform = `translateY(-${index * pageHeight}px)`;
            const canvas = await html2canvasRuntime!(viewport, {backgroundColor: '#fff', width: PAGE_WIDTH, height: pageHeight, windowWidth: PAGE_WIDTH, windowHeight: pageHeight, scale: 1, useCORS: true, logging: false});
            if (index > 0 && !hasVisiblePixels(canvas)) break;
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('截图失败')), 'image/jpeg', 0.92));
            files.push(new File([blob], `markdown-page-${String(index + 1).padStart(2, '0')}.jpg`, {type: 'image/jpeg'}));
            onProgress?.(index + 1, pages);
        }
        viewport.remove();
        return {files, formulaCount: rendered.formulaCount, pageCount: files.length, title: rendered.title};
    } finally {
        root.remove();
        katexStyle.remove();
    }
}

export const DOUYIN_IMAGE_MAX = IMAGE_MAX;
