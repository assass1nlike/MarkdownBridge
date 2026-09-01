import marked from 'marked';

export interface DouyinRenderResult {
    html: string;
    style: string;
    formulaCount: number;
    imageCount: number;
}

const TOKEN_PREFIX = `DMDMATH${Date.now()}${Math.floor(Math.random() * 1000000)}X`;

function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function safeUrl(value: string): string {
    const url = value.trim();
    if (/^(?:javascript|data|vbscript):/i.test(url)) return '';
    return url;
}

function renderFormula(tex: string, display: boolean): string {
    const formula = tex.trim();
    if (!formula) return '';
    const source = `https://latex.codecogs.com/svg.image?${encodeURIComponent(formula)}`;
    // Douyin's Tiptap editor removes arbitrary spans, styles, SVG and data URLs.
    // A loaded PNG/JPEG <img> is converted to Douyin's native image node.
    // Keep both dimensions >= 100 because the editor rejects smaller images.
    const canvasWidth = display ? 800 : 360;
    const canvasHeight = display ? 180 : 100;
    const imageUrl = `https://images.weserv.nl/?url=${encodeURIComponent(source)}&w=${canvasWidth}&h=${canvasHeight}&fit=contain&bg=white`;
    const className = display ? 'douyin-math-block' : 'douyin-math-inline';
    return `<img class="${className}" data-md-latex="${escapeAttribute(formula)}" alt="${escapeAttribute(formula)}" src="${escapeAttribute(imageUrl)}">`;
}

interface MathEntry { tex: string; display: boolean; }

/** Replace math outside code spans/fences with opaque tokens before marked parses it. */
function protectMath(source: string, entries: MathEntry[]): string {
    const stash = (tex: string, display: boolean) => {
        const index = entries.push({tex, display}) - 1;
        return `${TOKEN_PREFIX}${index}END`;
    };
    const quotePrefixAt = (text: string, position: number): string => {
        const lineStart = text.lastIndexOf('\n', position - 1) + 1;
        const prefix = text.slice(lineStart, position).match(/^[ \t]*(?:>[ \t]?)+/);
        return prefix?.[0] || '';
    };
    const stripQuotePrefix = (tex: string): string =>
        tex.replace(/^[ \t]*(?:>[ \t]?)+/gm, '').replace(/[ \t]+$/gm, '');
    const replace = (text: string): string => {
        let result = '';
        let i = 0;
        while (i < text.length) {
            if (text.startsWith('$$', i)) {
                const end = text.indexOf('$$', i + 2);
                if (end >= 0) {
                    const quote = quotePrefixAt(text, i);
                    const formula = quote ? stripQuotePrefix(text.slice(i + 2, end)) : text.slice(i + 2, end);
                    result += quote ? `${quote}${stash(formula, true)}` : `\n\n${stash(formula, true)}\n\n`;
                    i = end + 2;
                    continue;
                }
            }
            if (text.startsWith('\\[', i)) {
                const end = text.indexOf('\\]', i + 2);
                if (end >= 0) {
                    const quote = quotePrefixAt(text, i);
                    const formula = quote ? stripQuotePrefix(text.slice(i + 2, end)) : text.slice(i + 2, end);
                    result += quote ? `${quote}${stash(formula, true)}` : `\n\n${stash(formula, true)}\n\n`;
                    i = end + 2;
                    continue;
                }
            }
            if (text.startsWith('\\(', i)) {
                const end = text.indexOf('\\)', i + 2);
                if (end >= 0) {
                    result += stash(text.slice(i + 2, end), false);
                    i = end + 2;
                    continue;
                }
            }
            if (text[i] === '$' && text[i - 1] !== '\\' && text[i - 1] !== '$' && text[i + 1] !== '$') {
                let end = i + 1;
                while ((end = text.indexOf('$', end)) >= 0) {
                    if (text[end - 1] !== '\\' && text[end + 1] !== '$' && !text.slice(i + 1, end).includes('\n')) break;
                    end += 1;
                }
                if (end >= 0 && end > i + 1) {
                    result += stash(text.slice(i + 1, end), false);
                    i = end + 1;
                    continue;
                }
            }
            result += text[i++];
        }
        return result;
    };
    return source
        .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`)/g)
        .map(part => /^(?:```|~~~|`)/.test(part) ? part : replace(part))
        .join('');
}

function restoreMath(text: string, entries: MathEntry[]): string {
    return text.replace(new RegExp(`${TOKEN_PREFIX}(\\d+)END`, 'g'), (_all, index: string) => {
        const item = entries[Number(index)];
        return item ? renderFormula(item.tex, item.display) : _all;
    });
}

/**
 * Douyin's image node is block-level. If an inline image remains inside one
 * paragraph, Tiptap keeps the text before it but drops the text after it.
 * Split such paragraphs around each formula so no source text is lost.
 */
function splitInlineFormulaParagraphs(html: string): string {
    return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, content: string) => {
        if (!content.includes('class="douyin-math-inline"')) return whole;
        const parts = content.split(/(<img\b[^>]*class="douyin-math-inline"[^>]*>)/g);
        return parts.filter((part: string) => part.length > 0).map((part: string) =>
            part.startsWith('<img ') ? part : `<p>${part}</p>`
        ).join('');
    });
}

export function douyinMarkdownToHtml(source: string): DouyinRenderResult {
    const entries: MathEntry[] = [];
    let markdownImageCount = 0;
    const protectedSource = protectMath(source.replace(/\r\n?/g, '\n'), entries);
    const renderer = new marked.Renderer();
    renderer.heading = (text: string, level: number) => `<h${Math.min(6, Math.max(1, level))}>${text}</h${Math.min(6, Math.max(1, level))}>`;
    renderer.paragraph = (text: string) => /^<p class="douyin-math-block"/.test(text.trim()) ? text : `<p>${text}</p>`;
    renderer.hr = () => '<hr>';
    renderer.blockquote = (quote: string) => `<blockquote>${quote}</blockquote>`;
    renderer.code = (code: string, lang?: string) => `<pre><code${lang ? ` class="language-${escapeAttribute(lang)}"` : ''}>${escapeAttribute(code)}</code></pre>`;
    renderer.image = (href: string, title: string | null, text: string) => {
        markdownImageCount += 1;
        return `<img src="${escapeAttribute(safeUrl(href || ''))}" alt="${escapeAttribute(text || title || '')}">`;
    };
    renderer.link = (href: string, title: string | null, text: string) => `<a href="${escapeAttribute(safeUrl(href || ''))}"${title ? ` title="${escapeAttribute(title)}"` : ''}>${text}</a>`;
    renderer.html = (html: string) => escapeAttribute(html);
    renderer.text = (text: string) => restoreMath(text, entries);
    const html = marked(protectedSource, {renderer, breaks: true, sanitize: false, headerIds: false});
    return {
        html: splitInlineFormulaParagraphs(restoreMath(html, entries)),
        style: '.douyin-math-block{text-align:center;line-height:1.5;margin:1em 0;}',
        formulaCount: entries.length,
        // Douyin stores rendered formulas as native image nodes, so they share
        // the article's 30-image quota with ordinary Markdown images.
        imageCount: markdownImageCount + entries.length
    };
}
