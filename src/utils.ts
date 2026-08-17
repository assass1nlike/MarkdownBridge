/**
 * 异步休眠
 * @param ms 毫秒
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    })
}

/**
 * 阻塞获取元素
 * @param selector 选择器
 * @param timeout 最大超时毫秒数，-1为不超时
 */
export async function querySelectorBlock(document_: Document, selector: string, timeout: number = -1): Promise<HTMLElement> {
    let element: null | HTMLElement = null;
    let elapsed: number = 0;
    while (element === null) {
        if (timeout >= 0 && elapsed > timeout) {
            throw new Error(`获取 ${selector} 超时`);
        }
        
        element = document_.querySelector(selector);
        if (element) {
            return element;
        } else {
            await sleep(100);
            elapsed += 100;
        }
    }
    return element;
}

/**
 * 转义HTML标签
 */
export function safeHTML(text: string): string {
    return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\s/g, '&nbsp;')
}

/**
 * 加载以 \r\n 为分隔符的 HTTP 头
 */
export function loadHeaders(header: string): any {
    const headers: any = {};
    header.split('\r\n').map(v => v.split(': ')).forEach(([k, v]) => {
        headers[k] = v;
    });
    return headers;
}

/**
 * 获取编辑器 Document 对象
 */
export function getEditorDocument(): Document | null {
    if (document.querySelector('.ProseMirror')) {
        return document;
    }
    const newEditorFrame = <HTMLIFrameElement | null>document.querySelector(
        'iframe#new-edit-box, #new-edit-box iframe'
    );
    if (newEditorFrame?.contentDocument) {
        return newEditorFrame.contentDocument;
    }
    const wrap1 = <HTMLIFrameElement | null>document.querySelector('#edit-article-box iframe');
    if (wrap1) {
        const wrap2 = <HTMLIFrameElement | null>wrap1.contentDocument?.getElementById('ueditor_0');
        if (wrap2) {
            return <Document>wrap2.contentDocument;
        } else {
            return null;
        }
    } else {
        return null;
    }
}
