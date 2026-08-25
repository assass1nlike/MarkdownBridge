import TurndownService from 'turndown';
import {gfm} from 'turndown-plugin-gfm';

function getFormula(node: HTMLElement): string {
    const formula = node.getAttribute('data-formula');
    if (formula !== null) return formula.trim();

    const legacyFormula = node.getAttribute('alt') || '';
    if (legacyFormula) {
        try {
            return decodeURIComponent(legacyFormula).trim();
        } catch (_error) {
            return legacyFormula.trim();
        }
    }

    const source = node.getAttribute('src') || node.getAttribute('_src') || '';
    const sourceFormula = source.match(/[?&]formula=([^&#]*)/i)?.[1] || '';
    try {
        return decodeURIComponent(sourceFormula).trim();
    } catch (_error) {
        return sourceFormula.trim();
    }
}

function isLatexNode(node: HTMLElement): boolean {
    const source = node.getAttribute('src') || node.getAttribute('_src') || '';
    return node.getAttribute('data-type') === 'latex' ||
        node.getAttribute('type') === 'latex' ||
        node.classList.contains('latex') ||
        /mathjax\/tex\?.*formula=/i.test(source);
}

function isStandaloneFormula(node: HTMLElement): boolean {
    const parent = node.parentElement;
    if (!parent || !['P', 'DIV'].includes(parent.tagName)) return false;

    const meaningfulChildren = Array.from(parent.childNodes).filter(child => {
        if (child.nodeType === 3) return Boolean(child.textContent?.trim());
        return (<HTMLElement>child).tagName !== 'BR';
    });
    return meaningfulChildren.length === 1 && meaningfulChildren[0] === node;
}

function markdownLink(label: string, url: string): string {
    const safeLabel = label.replace(/([\\[\]])/g, '\\$1');
    const escapedUrl = url.replace(/([<>()])/g, '\\$1');
    const destination = /\s/.test(escapedUrl) ? `<${escapedUrl}>` : escapedUrl;
    return `[${safeLabel}](${destination})`;
}

function imageSource(node: HTMLElement): string {
    const source = node.getAttribute('src') || node.getAttribute('data-src') ||
        node.getAttribute('_src') || '';
    const absolute = source.startsWith('//') ? `https:${source}` : source;
    return absolute.replace(/(@[^/?#]+)(?=([?#]|$))/, '');
}

function markdownImage(node: HTMLElement, caption = ''): string {
    const source = imageSource(node);
    if (!source) return '';
    const alt = (caption || node.getAttribute('alt') || '')
        .trim()
        .replace(/([\[\]])/g, '\\$1');
    return `![${alt}](${source})`;
}

function fencedCode(node: HTMLElement): string {
    const pre = node.querySelector('pre');
    if (!pre) return '';

    const code = pre.textContent || pre.getAttribute('codecontent') || '';
    const classLanguage = Array.from(pre.classList)
        .map(name => name.match(/^language-(.+)$/)?.[1])
        .find(Boolean);
    const language = (pre.getAttribute('data-lang') || classLanguage || '').replace(/[^\w#+.-]/g, '');
    const fence = code.includes('```') ? '~~~' : '```';
    return `\n\n${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
}

/** Convert current Bilibili editor HTML to portable Markdown. */
export function biliHtmlToMarkdown(html: string | HTMLElement): string {
    const service = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined'
    });
    service.use(gfm);

    service.addRule('bilibiliLatex', {
        filter: node => isLatexNode(node),
        replacement: (_content, node) => {
            const formula = getFormula(node);
            if (!formula) return '';
            return isStandaloneFormula(node)
                ? `\n\n$$\n${formula}\n$$\n\n`
                : `$${formula}$`;
        }
    });

    service.addRule('bilibiliCodeBlock', {
        filter: node => node.tagName === 'FIGURE' && node.classList.contains('code-box'),
        replacement: (_content, node) => fencedCode(node)
    });

    service.addRule('bilibiliImageFigure', {
        filter: node => node.tagName === 'FIGURE' &&
            node.classList.contains('img-box') &&
            Boolean(node.querySelector('img:not([data-type="latex"]):not([type="latex"])')),
        replacement: (_content, node) => {
            const image = node.querySelector('img');
            if (!image) return '';
            const caption = node.querySelector('figcaption')?.textContent?.trim() ||
                image.getAttribute('alt') || '';
            const markdown = markdownImage(image, caption);
            return markdown ? `\n\n${markdown}\n\n` : '';
        }
    });

    service.addRule('bilibiliOpusImage', {
        filter: node => node.tagName === 'DIV' &&
            node.classList.contains('opus-para-pic') &&
            Boolean(Array.from(node.querySelectorAll('img')).find(image => !isLatexNode(image))),
        replacement: (_content, node) => {
            const image = Array.from(node.querySelectorAll('img'))
                .find(candidate => !isLatexNode(candidate));
            if (!image) return '';
            const caption = node.querySelector('.opus-pic-view__caption')?.textContent?.trim() || '';
            const markdown = markdownImage(image, caption);
            return markdown ? `\n\n${markdown}\n\n` : '';
        }
    });

    service.addRule('bilibiliImage', {
        filter: node => node.tagName === 'IMG' && !isLatexNode(node),
        replacement: (_content, node) => markdownImage(node)
    });

    // The legacy importer represented emphasis and inline code with color
    // classes. Preserve their original Markdown meaning during export.
    service.addRule('legacyEmphasis', {
        filter: node => node.tagName === 'SPAN' &&
            (node.classList.contains('color-gray-01') || node.style.fontStyle === 'italic'),
        replacement: content => content.trim() ? `*${content}*` : ''
    });
    service.addRule('legacyInlineCode', {
        filter: node => node.tagName === 'SPAN' &&
            node.classList.contains('color-pink-03') &&
            !(node.nextElementSibling?.classList.contains('color-blue-02')),
        replacement: content => content.trim() ? `\`${content}\`` : ''
    });
    service.addRule('legacyExternalLinkLabel', {
        filter: node => node.tagName === 'SPAN' &&
            node.classList.contains('color-pink-03') &&
            Boolean(node.nextElementSibling?.classList.contains('color-blue-02')),
        replacement: (content, node) => {
            const label = content.trim().replace(/^【|】$/g, '');
            const url = node.nextElementSibling?.textContent?.trim() || '';
            return label && url ? markdownLink(label, url) : content;
        }
    });
    service.addRule('legacyExternalLinkUrl', {
        filter: node => node.tagName === 'SPAN' &&
            node.classList.contains('color-blue-02') &&
            Boolean(node.previousElementSibling?.classList.contains('color-pink-03')),
        replacement: () => ''
    });
    service.addRule('styledStrong', {
        filter: node => node.tagName === 'SPAN' && /^(bold|[6-9]00)$/.test(node.style.fontWeight),
        replacement: content => content.trim() ? `**${content}**` : ''
    });
    service.addRule('underline', {
        filter: node => node.tagName === 'U' || node.style.textDecoration.includes('underline'),
        replacement: content => `<u>${content}</u>`
    });

    const markdown = service.turndown(html).trim();
    return markdown ? `${markdown}\n` : '';
}
