import {douyinMarkdownToHtml} from './douyin-markdown';

const BUTTON_ID = 'markdown4douyin-import';
const STYLE_ID = 'markdown4douyin-style';

function findEditor(): HTMLElement | null {
    const selectors = [
        '.ProseMirror[contenteditable="true"]',
        '[data-slate-editor="true"]',
        '[contenteditable="true"]',
        '[role="textbox"]'
    ];
    const all: HTMLElement[] = [];
    for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.width >= 240 && rect.height >= 80 &&
                !element.matches('input,textarea') && !element.closest('[aria-hidden="true"]') &&
                !all.includes(element)) all.push(element);
        }
    }
    all.sort((a, b) => {
        const score = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            const semantic = element.matches('.ProseMirror[contenteditable="true"],[data-slate-editor="true"]') ? 1000000 : 0;
            return semantic + rect.width * rect.height;
        };
        return score(b) - score(a);
    });
    return all[0] || null;
}

function injectStyle(css: string) {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
}

function writeEditor(editor: HTMLElement, html: string) {
    editor.focus();
    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    let inserted = false;
    try { inserted = document.execCommand('insertHTML', false, html); } catch (_error) { /* browser may disable execCommand */ }
    if (!inserted) {
        editor.innerHTML = html;
    }
    editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertFromPaste', data: null}));
    editor.dispatchEvent(new Event('change', {bubbles: true}));
}

function setButtonState(button: HTMLButtonElement, text: string) {
    button.textContent = text;
    window.setTimeout(() => {
        if (button.isConnected) button.textContent = '导入 Markdown';
    }, 1800);
}

function addButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const editor = findEditor();
    if (!editor) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '导入 Markdown';
    button.title = '选择 Markdown 文件并插入抖音文章编辑器';
    Object.assign(button.style, {
        position: 'fixed', top: '88px', right: '24px', zIndex: '2147483647',
        padding: '8px 14px', border: '1px solid #1677ff', borderRadius: '4px',
        background: '#1677ff', color: '#fff', font: '14px sans-serif', cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,.15)'
    });
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            const currentEditor = findEditor();
            if (!currentEditor) throw new Error('未找到抖音文章编辑区域，请先打开正文编辑器');
            setButtonState(button, '转换中...');
            const result = douyinMarkdownToHtml(await file.text());
            if (result.imageCount > 30) {
                throw new Error(`图片数量为 ${result.imageCount} 张，抖音单篇文章最多支持 30 张，请减少公式或图片后重试`);
            }
            injectStyle(result.style);
            writeEditor(currentEditor, result.html);
            setButtonState(button, result.formulaCount ? `已导入（公式 ${result.formulaCount} 个）` : '导入完成');
        } catch (error) {
            console.error('[markdown4douyin]', error);
            setButtonState(button, '导入失败');
            alert(`导入 Markdown 失败：${error instanceof Error ? error.message : String(error)}`);
        }
    });
    button.addEventListener('click', () => input.click());
    document.body.append(button, input);
}

function start() {
    addButton();
    const observer = new MutationObserver(() => addButton());
    observer.observe(document.documentElement, {childList: true, subtree: true});
    window.setInterval(addButton, 1500);
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, {once: true});
else start();
