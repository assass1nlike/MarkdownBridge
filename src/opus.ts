import {biliHtmlToMarkdown} from './reverse';

const CONTENT_SELECTORS = [
    '.opus-detail .opus-module-content',
    '.opus-module-content',
    '.article-content #read-article-holder',
    '.article-content'
];

const TITLE_SELECTORS = [
    '.opus-detail .opus-module-title__text',
    '.opus-module-title__text',
    '.article-title',
    'h1.title'
];

export function findOpusContent(document_: Document): HTMLElement | null {
    for (const selector of CONTENT_SELECTORS) {
        const content = document_.querySelector<HTMLElement>(selector);
        if (content) return content;
    }
    return null;
}

export function findOpusTitle(document_: Document): string {
    for (const selector of TITLE_SELECTORS) {
        const title = document_.querySelector<HTMLElement>(selector)?.textContent?.trim();
        if (title) return title;
    }

    const socialTitle = document_.querySelector<HTMLMetaElement>('meta[property="og:title"]')
        ?.content.trim();
    if (socialTitle) return socialTitle;

    return document_.title
        .replace(/[_-]哔哩哔哩(?:弹幕视频网)?[_-]?bilibili.*$/i, '')
        .trim();
}

function markdownHeading(title: string): string {
    return title
        .replace(/\s+/g, ' ')
        .replace(/([\\`*_[\]<>#])/g, '\\$1')
        .trim();
}

export function opusToMarkdown(content: HTMLElement | string, title = ''): string {
    const body = biliHtmlToMarkdown(content).trim();
    const heading = markdownHeading(title);
    if (!heading) return body ? `${body}\n` : '';
    return body ? `# ${heading}\n\n${body}\n` : `# ${heading}\n`;
}

export function opusDocumentToMarkdown(document_: Document): {markdown: string; title: string} {
    const content = findOpusContent(document_);
    if (!content) {
        throw new Error('找不到已发布图文的正文，请确认页面已加载完成');
    }
    const title = findOpusTitle(document_);
    return {markdown: opusToMarkdown(content, title), title};
}
