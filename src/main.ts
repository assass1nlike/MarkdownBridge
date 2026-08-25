import {sleep, querySelectorBlock} from './utils';
import {markToBili} from './marked';
import {biliHtmlToMarkdown} from './reverse';
import {opusDocumentToMarkdown} from './opus';

let editorDocument: Document;
let editorContentDocument: Document;

interface NewEditorContext {
    document: Document;
    editor: any | null;
    frame: HTMLIFrameElement | null;
}

let newEditorContext: NewEditorContext | null = null;
const MESSAGE_CHANNEL = 'bilibili-article-md-new-edit';

function getOwnEditor(): any | null {
    try {
        const pageWindow: any = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
        return pageWindow.editor || null;
    } catch (_error) {
        return null;
    }
}

async function requestEditor(type: string, payload: Record<string, unknown> = {}): Promise<any> {
    const frame = <HTMLIFrameElement>await querySelectorBlock(
        document,
        'iframe#new-edit-box, #new-edit-box iframe',
        30000
    );
    const target = frame.contentWindow;
    if (!target) {
        throw new Error('找不到新版 B 站编辑器窗口');
    }

    const requestId = `${Date.now()}-${Math.random()}`;
    return await new Promise<any>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            window.removeEventListener('message', onMessage);
            reject(new Error('内层编辑器脚本没有响应，请确认油猴已允许脚本在 iframe 中运行'));
        }, 30000);
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (event.source !== target || data?.channel !== MESSAGE_CHANNEL ||
                data?.type !== 'result' || data?.requestId !== requestId) {
                return;
            }
            window.clearTimeout(timeout);
            window.removeEventListener('message', onMessage);
            if (data.ok) {
                resolve(data);
            } else {
                reject(new Error(data.error || '内层编辑器导入失败'));
            }
        };
        window.addEventListener('message', onMessage);
        target.postMessage({
            channel: MESSAGE_CHANNEL,
            type,
            requestId,
            ...payload
        }, '*');
    });
}

async function sendMarkdownToEditor(markdown: string): Promise<void> {
    await requestEditor('import', {markdown});
}

async function requestMarkdownFromEditor(): Promise<string> {
    const result = await requestEditor('export');
    if (typeof result.markdown !== 'string') {
        throw new Error('内层编辑器没有返回 Markdown 内容');
    }
    return result.markdown;
}

function applyPageButtonStyle(button: HTMLButtonElement, top: number, background: string) {
    Object.assign(button.style, {
        position: 'fixed',
        top: `${top}px`,
        right: '20px',
        zIndex: '2147483647',
        width: '88px',
        height: '36px',
        padding: '0 12px',
        border: '0',
        borderRadius: '6px',
        background,
        color: '#fff',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0, 0, 0, .18)'
    });
}

function safeFilename(title: string, fallback: string): string {
    return (title.trim() || fallback)
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 80);
}

function exportFilename(): string {
    const titleField = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
        .find(input => /标题/.test(input.placeholder || '') && input.value.trim());
    const fallback = `bilibili-article-${new Date().toISOString().slice(0, 10)}`;
    return `${safeFilename(titleField?.value || '', fallback)}.md`;
}

function downloadMarkdown(markdown: string, filename = exportFilename()) {
    const url = URL.createObjectURL(new Blob([markdown], {type: 'text/markdown;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function insertOpusExportButton() {
    if (document.getElementById('bmd-opus-export')) return;

    const button = document.createElement('button');
    button.id = 'bmd-opus-export';
    button.type = 'button';
    button.textContent = '导出 MD';
    button.title = '将这篇已发布的 B 站图文下载为 Markdown 文件';
    applyPageButtonStyle(button, 120, '#18191c');
    button.addEventListener('click', () => {
        try {
            button.textContent = '导出中…';
            const {markdown, title} = opusDocumentToMarkdown(document);
            const fallback = `bilibili-opus-${location.pathname.split('/').filter(Boolean).pop() ||
                new Date().toISOString().slice(0, 10)}`;
            downloadMarkdown(markdown, `${safeFilename(title, fallback)}.md`);
            button.textContent = '导出完成';
        } catch (error) {
            console.error('[bilibili-article-md]', error);
            button.textContent = '导出失败';
            alert(`导出 Markdown 失败：${error instanceof Error ? error.message : error}`);
        } finally {
            window.setTimeout(() => button.textContent = '导出 MD', 2000);
        }
    });
    document.body.appendChild(button);
}

/**
 * Add an entry point in the parent page. This remains available even when
 * Bilibili changes the iframe toolbar DOM, and also proves that the userscript
 * is actually running on the current URL.
 */
function insertPageButtons() {
    if (document.getElementById('bmd-page-import')) return;
    const button = document.createElement('button');
    button.id = 'bmd-page-import';
    button.type = 'button';
    button.textContent = '导入 MD';
    button.title = 'bilibili-article-md 0.1.0：导入 Markdown 文件';
    applyPageButtonStyle(button, 120, '#00aeec');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            button.textContent = '导入中…';
            await sendMarkdownToEditor(await file.text());
            button.textContent = '导入完成';
        } catch (error) {
            console.error('[bilibili-article-md]', error);
            button.textContent = '导入失败';
            alert(`导入 Markdown 失败：${error instanceof Error ? error.message : error}`);
        } finally {
            input.value = '';
            window.setTimeout(() => button.textContent = '导入 MD', 2000);
        }
    });
    button.addEventListener('click', () => input.click());
    document.body.appendChild(button);
    document.body.appendChild(input);

    const exportButton = document.createElement('button');
    exportButton.id = 'bmd-page-export';
    exportButton.type = 'button';
    exportButton.textContent = '导出 MD';
    exportButton.title = '将当前 B 站图文内容下载为 Markdown 文件';
    applyPageButtonStyle(exportButton, 164, '#18191c');
    exportButton.addEventListener('click', async () => {
        try {
            exportButton.textContent = '导出中…';
            downloadMarkdown(await requestMarkdownFromEditor());
            exportButton.textContent = '导出完成';
        } catch (error) {
            console.error('[bilibili-article-md]', error);
            exportButton.textContent = '导出失败';
            alert(`导出 Markdown 失败：${error instanceof Error ? error.message : error}`);
        } finally {
            window.setTimeout(() => exportButton.textContent = '导出 MD', 2000);
        }
    });
    document.body.appendChild(exportButton);
}

function loadStyle(targetDocument: Document) {
    if (targetDocument.getElementById('bmd-style')) {
        return;
    }
    const styleElement = targetDocument.createElement('style');
    styleElement.id = 'bmd-style';
    styleElement.textContent = GM_getResourceText('style');
    (targetDocument.head || targetDocument.body).appendChild(styleElement);
}

/**
 * The current Bilibili editor runs inside #new-edit-box and exposes its
 * Tiptap editor instance as window.editor. Firefox userscripts may see a
 * wrapped window, hence the wrappedJSObject fallback.
 */
function getFrameWindow(frame: HTMLIFrameElement): any {
    // Tampermonkey's Firefox sandbox exposes page-owned objects through
    // unsafeWindow. Query the iframe again from that page world so that
    // window.editor is not hidden behind an Xray wrapper.
    const pageWindow: any = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const pageFrame: any = pageWindow.document?.querySelector(
        'iframe#new-edit-box, #new-edit-box iframe'
    ) || frame;
    const frameWindow: any = pageFrame.contentWindow;
    try {
        return frameWindow?.wrappedJSObject || frameWindow;
    } catch (_error) {
        // Reading wrappedJSObject itself throws for Bilibili's isolated iframe.
        return null;
    }
}

async function getNewEditorContext(): Promise<NewEditorContext> {
    const frame = <HTMLIFrameElement>await querySelectorBlock(
        document,
        'iframe#new-edit-box, #new-edit-box iframe',
        30000
    );
    const start = Date.now();
    while (Date.now() - start < 30000) {
        const frameDocument = frame.contentDocument;
        const frameWindow = getFrameWindow(frame);
        const editor = frameWindow?.editor || null;
        // Do not make the toolbar depend on access to the page-world editor.
        // Firefox userscript isolation may hide it even though the DOM is ready.
        if (frameDocument && frameDocument.querySelector('.ProseMirror')) {
            return {document: frameDocument, editor, frame};
        }
        await sleep(100);
    }
    throw new Error('获取新版 B 站编辑器超时');
}

/** Write Markdown into the active editor. */
async function writeContent(markdown: string) {
    const result = await markToBili(markdown);
    if (newEditorContext) {
        const currentEditor = (newEditorContext.frame
            ? getFrameWindow(newEditorContext.frame)?.editor
            : getOwnEditor()) || newEditorContext.editor;
        if (currentEditor?.commands?.setContent) {
            // Tiptap owns the ProseMirror DOM; use its public command whenever
            // the page-world editor object is reachable.
            currentEditor.commands.setContent(result);
            newEditorContext.editor = currentEditor;
            return;
        }

        // Firefox fallback: replace the focused contenteditable selection.
        // ProseMirror observes the resulting DOM/input mutation and updates
        // its state even when the userscript cannot call window.editor.
        const proseMirror = <HTMLElement | null>newEditorContext.document.querySelector('.ProseMirror');
        if (!proseMirror) {
            throw new Error('找不到新版 B 站编辑区');
        }
        proseMirror.focus();
        const selection = newEditorContext.document.defaultView?.getSelection();
        const range = newEditorContext.document.createRange();
        range.selectNodeContents(proseMirror);
        selection?.removeAllRanges();
        selection?.addRange(range);
        if (!newEditorContext.document.execCommand('insertHTML', false, result)) {
            proseMirror.innerHTML = result;
            proseMirror.dispatchEvent(new Event('input', {bubbles: true}));
        }
        return;
    }
    editorContentDocument.body.innerHTML = result;
    // Trigger an update in the legacy UEditor.
    editorContentDocument.documentElement.dispatchEvent(new KeyboardEvent('keypress', {
        code: 'Space',
        key: ' '
    }));
}

async function writeNewContent(markdown: string) {
    if (!newEditorContext) {
        newEditorContext = await getNewEditorContext();
    }
    await writeContent(markdown);
}

function readNewContent(): string {
    const editor = getOwnEditor() || newEditorContext?.editor;
    if (editor?.getHTML) {
        try {
            return biliHtmlToMarkdown(editor.getHTML());
        } catch (error) {
            console.warn('[bilibili-article-md] editor.getHTML() unavailable, using DOM fallback', error);
        }
    }
    const proseMirror = <HTMLElement | null>document.querySelector('.ProseMirror');
    if (!proseMirror) {
        throw new Error('找不到新版 B 站编辑区');
    }
    return biliHtmlToMarkdown(proseMirror.innerHTML);
}

/** Insert the Markdown file button into the legacy UEditor toolbar. */
async function insertToolbarItem() {
    const toolbar = await querySelectorBlock(editorDocument, '.editor-toolbar');
    const cutOffLineElement = editorDocument.createElement('li');
    cutOffLineElement.className = 'toolbar-item cut-off left';
    toolbar?.appendChild(cutOffLineElement);

    const item = editorDocument.createElement('li');
    item.className = 'toolbar-item left';
    item.id = 'bmd-toolbar-item';

    const img = editorDocument.createElement('img');
    img.src = GM_getResourceURL('icon');
    item.appendChild(img);

    const input = editorDocument.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt';
    input.title = '点击上传 Markdown 文件';
    input.onchange = async (ev) => {
        const file = (<HTMLInputElement>ev.target).files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.md')) {
            alert('不是合法的 Markdown 文件！');
            return;
        }
        await writeContent(await file.text());
    };
    item.appendChild(input);
    toolbar.appendChild(item);
}

/** Insert the Markdown file button into the current Tiptap toolbar. */
async function insertNewToolbarItem(context: NewEditorContext) {
    if (context.document.getElementById('bmd-toolbar-item')) {
        return;
    }
    const toolbar = await querySelectorBlock(context.document, '.toolbar', 30000);
    const item = context.document.createElement('button');
    item.id = 'bmd-toolbar-item';
    item.type = 'button';
    item.title = '导入 Markdown 文件';
    item.textContent = 'M';

    const input = context.document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.style.display = 'none';
    input.addEventListener('change', async (event) => {
        const file = (<HTMLInputElement>event.target).files?.[0];
        if (!file) return;
        if (!/\.(md|markdown|txt)$/i.test(file.name)) {
            alert('不是合法的 Markdown 文件！');
            return;
        }
        try {
            await writeNewContent(await file.text());
        } catch (error) {
            console.error('[bilibili-article-md]', error);
            alert('导入 Markdown 失败，请打开控制台查看错误。');
        } finally {
            input.value = '';
        }
    });
    item.addEventListener('click', () => input.click());
    toolbar.appendChild(item);
    toolbar.appendChild(input);
}

/** Preserve drag-and-drop import in the legacy UEditor. */
async function initDragBox() {
    const editorBox = await querySelectorBlock(editorDocument, '#editor-box');
    editorBox.style.position = 'relative';

    const hintBox = editorDocument.createElement('div');
    hintBox.id = 'bmd-drag-hint';
    const hint = editorDocument.createElement('span');
    hintBox.appendChild(hint);
    editorBox.appendChild(hintBox);

    let lastTarget: EventTarget | null;
    editorContentDocument.addEventListener('dragenter', (event) => {
        lastTarget = event.target;
        hintBox.className = 'show';
        hint.textContent = '放开鼠标以插入 Markdown';
        event.preventDefault();
    });
    editorContentDocument.addEventListener('dragleave', (event) => {
        if (event.target === lastTarget) {
            hintBox.className = '';
            hint.textContent = '拖动文件到此处以插入 Markdown';
            event.preventDefault();
        }
    });
    editorContentDocument.addEventListener('dragover', (event) => event.preventDefault());
    editorContentDocument.addEventListener('drop', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        hintBox.className = '';
        const file = event.dataTransfer?.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.md')) {
            alert('不是合法的 Markdown 文件！');
            return;
        }
        await writeContent(await file.text());
    }, true);
}

/** Initialize legacy UEditor support. */
async function init() {
    const editor = <HTMLIFrameElement>await querySelectorBlock(document, '#edit-article-box iframe');
    editor.addEventListener('load', async () => {
        editorDocument = <Document>editor.contentDocument;
        const editorContent = <HTMLIFrameElement>await querySelectorBlock(editorDocument, '#ueditor_0');
        editorContent.onload = () => {
            editorContentDocument = <Document>editorContent.contentDocument;
            loadStyle(editorDocument);
            insertToolbarItem();
            initDragBox();
        };
    });
}

/** Initialize the current Tiptap/ProseMirror editor. */
async function initNew() {
    try {
        const frame = <HTMLIFrameElement>await querySelectorBlock(
            document,
            'iframe#new-edit-box, #new-edit-box iframe',
            30000
        );
        // The outer page provides the import/export controls through the
        // message bridge.
        if (!frame.contentDocument) {
            console.info('[bilibili-article-md] isolated editor iframe detected; using message bridge');
            return;
        }
        newEditorContext = await getNewEditorContext();
        loadStyle(newEditorContext.document);
        console.info('[bilibili-article-md] new-edit adapter ready');
    } catch (error) {
        console.error('[bilibili-article-md] new-edit initialization failed', error);
    }
}

/** Initialize the userscript instance that runs inside /york/read-editor. */
async function initEmbeddedEditor() {
    try {
        await querySelectorBlock(document, '.ProseMirror', 30000);
        newEditorContext = {
            document,
            editor: getOwnEditor(),
            frame: null
        };
        loadStyle(document);

        window.addEventListener('message', async (event: MessageEvent) => {
            const data = event.data;
            if (event.source !== window.parent || data?.channel !== MESSAGE_CHANNEL ||
                !['import', 'export'].includes(data?.type)) {
                return;
            }
            try {
                if (data.type === 'import') {
                    if (typeof data.markdown !== 'string') {
                        throw new Error('导入内容不是有效的 Markdown 文本');
                    }
                    await writeNewContent(data.markdown);
                }
                (<Window>event.source).postMessage({
                    channel: MESSAGE_CHANNEL,
                    type: 'result',
                    requestId: data.requestId,
                    ok: true,
                    markdown: data.type === 'export' ? readNewContent() : undefined
                }, '*');
            } catch (error) {
                (<Window>event.source).postMessage({
                    channel: MESSAGE_CHANNEL,
                    type: 'result',
                    requestId: data.requestId,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error)
                }, '*');
            }
        });
        console.info('[bilibili-article-md] embedded editor adapter ready');
    } catch (error) {
        console.error('[bilibili-article-md] embedded editor initialization failed', error);
    }
}

let prevPath = '';
function startRouteWatcher() {
    // Bilibili is an SPA, so watch for route changes after the initial load.
    setInterval(() => {
        if (prevPath === location.pathname) {
            return;
        }
        prevPath = location.pathname;
        if (prevPath === '/platform/upload/text/edit') {
            init();
        } else if (prevPath.startsWith('/platform/upload/text/new-edit')) {
            insertPageButtons();
            initNew();
        } else if (/^\/opus\/\d+/.test(prevPath)) {
            insertOpusExportButton();
        }
    }, 200);
}

const start = () => {
    if (location.pathname.startsWith('/york/read-editor')) {
        initEmbeddedEditor();
    } else {
        startRouteWatcher();
    }
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start, {once: true});
} else {
    start();
}
