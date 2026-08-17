import marked from 'marked';
import {getEditorDocument, loadHeaders, safeHTML} from './utils';
import Prism from 'prismjs';
import { CanvasTable, CTConfig, CTData } from "canvas-table";
import CryptoJS from 'crypto-js';
import cookie from 'js-cookie';
import mime from 'mime';

interface TableCell {
    value: any
    align?: 'left' | 'center' | 'right'
}

interface TableData {
    token: string
    headers: any[]
    rows: TableCell[][]
}

/**
 * 计算半角数量，一个全角等于两个半角
 * @param text 
 */
function calculateBanjiaoCount(text: string): number {
    let count: number = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i);
        if (code) {
            if (code < 128) {
                // 半角
                count += 1;
            } else {
                // 全角
                count += 2;
            }
        }
    }
    return count;
}

/**
 * 计算表格大小
 * @param tableData 
 */
function calculateTableSize(tableData: TableData, fontSize: number = 16, padding: number = 5): [number, number] {
    let maxW: number, maxH: number;
    // 获取最大列宽
    // 收集每行宽度
    let widths: number[] = [];
    let hw: number = 0;
    tableData.headers.forEach(v => {
        hw += calculateBanjiaoCount(v) * fontSize + padding * 2;
    });
    widths.push(hw);
    tableData.rows.forEach(v => {
        let w: number = 0;
        v.forEach(v1 => {
            w += calculateBanjiaoCount(v1.value) * fontSize + padding * 2;
        });
        widths.push(w);
    });
    maxW = Math.max(...widths);
    // 获取高度
    maxH = (tableData.rows.length + 1) * (fontSize + padding * 2) + fontSize * 2;
    return [maxW, maxH]
}

/**
 * 生成表格图片
 * @param tableData 
 */
async function makeTableImage(tableData: TableData): Promise<Blob> {
    const canvas = document.createElement('canvas');
    // 计算表格大小
    const [width, height] = calculateTableSize(tableData);
    // 限制最大宽度
    canvas.width = width;
    canvas.height = height;
    const config: CTConfig = {
        data: tableData.rows.map(cells => cells.map(cell => cell.value)),
        columns: tableData.headers.map(header => {
            return {
                title: header
            }
        }),
        options: {
            fit: true
        }
    }
    const ct = new CanvasTable(canvas, config);
    await ct.generateTable();
    return await ct.renderToBlob();
}

/**
 * 占位符图片，等待上传后替换成真正的图片
 * @param id 图片id
 */
function getPlaceholderImg(id: string): string {
    const figure = document.createElement('figure');
    figure.className = 'img-box';
    figure.contentEditable = 'false';
    figure.id = id;

    const e = document.createElement('img');
    e.src = '//static.hdslb.com/mstation/images/appeal/loading.gif';
    e.setAttribute('_src', '//static.hdslb.com/mstation/images/appeal/loading.gif');
    figure.append(e);
    return figure.outerHTML;
}

/**
 * 生成图片元素
 * @param src 图片URL
 * @param height 图片高度
 * @param width 图片宽度
 * @param size 图片大小
 * @param text 图片描述
 */
function makeImage(src: string, size: number, text?: string): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'img-box';
    figure.contentEditable = 'false';
    
    const img = document.createElement('img');
    img.src = src;
    img.dataset.size = size.toString();
    img.setAttribute('_src', src);
    figure.appendChild(img);

    if (text) {
        const cap = document.createElement('figcaption');
        cap.className = 'caption';
        cap.contentEditable = 'false';
        cap.innerText = text;
        figure.appendChild(cap);
    }
    return figure;
}

/**
 * 将换行符转换为 \<p>\</p>
 * @param text 文本
 */
function transferParagraph(text: string): string {
    const paragraphs: string[] = text.split('\n');
    return paragraphs.map(t => `<p>${safeHTML(t)}</p>`).join('');
}

interface ImageInfo {
    token: string
    originUrl: string
    text?: string
}

/** Render a formula as the node type used by the current Tiptap editor. */
function makeLatexImage(tex: string): string {
    const formula = tex.trim();
    if (!formula) {
        return '';
    }
    const e = document.createElement('img');
    e.className = 'latex';
    e.setAttribute('data-type', 'latex');
    e.setAttribute('data-formula', formula);
    e.alt = formula;
    const url = `//api.bilibili.com/x/web-frontend/mathjax/tex?formula=${encodeURIComponent(formula)}`;
    e.src = url;
    e.setAttribute('_src', url);
    return e.outerHTML;
}

/**
 * Protect formulas before marked parses backslash escapes. Code spans and
 * fenced code blocks are deliberately left untouched.
 */
function stashLatex(content: string, formulas: string[], tokenPrefix: string): string {
    const stash = (tex: string) => {
        const index = formulas.push(tex) - 1;
        return `${tokenPrefix}${index}END`;
    };
    const replaceOutsideCode = (text: string) => {
        let result = text;
        // Match multiline display formulas by delimiter lines. Pairing the
        // first opening line with the first closing line prevents ordinary
        // text between two formula blocks from being consumed as TeX.
        result = result.replace(
            /(^|\n)[ \t]*\\\[[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\\\][ \t]*(?=\n|$)/g,
            (_origin, prefix, tex) => `${prefix}\n\n${stash(tex)}\n\n`
        );
        result = result.replace(
            /(^|\n)[ \t]*\$\$[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\$\$[ \t]*(?=\n|$)/g,
            (_origin, prefix, tex) => `${prefix}\n\n${stash(tex)}\n\n`
        );
        // Also accept a same-line display form such as `$$x^2$$`, but never
        // cross a newline when pairing its delimiters.
        result = result.replace(/\\\[([^\r\n]*?)\\\]/g, (_origin, tex) => `\n\n${stash(tex)}\n\n`);
        result = result.replace(/\$\$([^\r\n]*?)\$\$/g, (_origin, tex) => `\n\n${stash(tex)}\n\n`);
        result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_origin, tex) => stash(tex));
        result = result.replace(/(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g, (_origin, prefix, tex) => {
            return prefix + stash(tex);
        });
        return result;
    };

    return content
        .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`)/g)
        .map(part => /^(?:```|~~~|`)/.test(part) ? part : replaceOutsideCode(part))
        .join('');
}

function restoreLatex(text: string, formulas: string[], tokenPrefix: string): string {
    // Scan token boundaries directly. This avoids regex edge cases and makes
    // it impossible for an internal BLOCK marker to leak into the editor.
    let result = '';
    let cursor = 0;
    while (cursor < text.length) {
        const start = text.indexOf(tokenPrefix, cursor);
        if (start < 0) {
            result += text.slice(cursor);
            break;
        }
        result += text.slice(cursor, start);
        const end = text.indexOf('END', start + tokenPrefix.length);
        if (end < 0) {
            result += text.slice(start);
            break;
        }
        const indexText = text.slice(start + tokenPrefix.length, end);
        if (!/^\d+$/.test(indexText)) {
            result += text.slice(start, end + 3);
        } else {
            result += makeLatexImage(formulas[Number(indexText)] || '');
        }
        cursor = end + 3;
    }
    return result;
}

/**
 * 从网络 URL 中下载图片
 * @param url 
 */
function downloadImage(url: string): Promise<File> {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            timeout: 60000,
            responseType: 'blob',
            onerror: reject,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            },
            onload(res) {
                // 判断 MIME 类型
                const headers = loadHeaders(res.responseHeaders);
                const mime1 = <string>headers['content-type'];
                if (mime1.startsWith('image')) {
                    const file = new File([res.response], 'image.' + mime.getExtension(mime1), {
                        type: mime1
                    })
                    resolve(file);
                } else {
                    // 不正确的 content-type
                    reject('服务器返回的 content-type 不是正确的图像类型')
                }
            }
        })
    });
}

/**
 * 上传图片到b站服务器
 * @param url 
 */
function uploadImage(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
        const csrf: string = <string>cookie.get('bili_jct');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://api.bilibili.com/x/article/creative/article/upcover');
        xhr.responseType = 'json';
        xhr.withCredentials = true;
        const formData = new FormData();
        formData.append('binary', file, file.name);
        formData.append('csrf', csrf);
        xhr.send(formData);
        xhr.onerror = reject;
        xhr.onloadend = () => {
            resolve(xhr.response);
        };
    })
}

/**
 * 图片任务
 * @param img 
 */
async function imageTask(img: ImageInfo): Promise<void> {
    // 检查图片路径是否为合法网络URL
    const URL_PATTERN = /^https?:\/\/.*$/i;
    if (URL_PATTERN.test(img.originUrl)) {
        // 下载图片
        const resp = await downloadImage(img.originUrl);
        // 上传图片
        const resp1 = await uploadImage(resp);
        if (resp1.code === 0) {
            const data = resp1.data;
            const editorContentDocument = getEditorDocument();
            if (editorContentDocument) {
                const figure = <HTMLElement>editorContentDocument.getElementById(img.token);
                figure.after(makeImage(data.url, data.size, img.text));
                figure.remove();
            } else {
                alert('找不到编辑器的 Document 对象，无法插入图片')
            }
        } else {
            console.error(resp1);
            alert('上传图片失败：' + resp1.message)
        }
    } else {
        // 不是合法网络URL
        alert(`图片路径：${img.originUrl} 不是合法的 URL。`);
    }
}



/**
 * 表格任务
 * @param table 
 */
async function tableTask(table: TableData) {
    // 生成表格图片
    const blob = await makeTableImage(table);
    // 上传
    const resp = await uploadImage(new File([blob], 'table.jpg', {
        type: 'image/jpeg'
    }));
    if (resp.code === 0) {
        const doc = getEditorDocument();
        if (doc) {
            // 插入表格
            const figure = doc.getElementById(table.token);
            if (figure) {
                figure.after(makeImage(resp.data.url, resp.data.size));
                figure.remove();
            }
        }
    }
}

/**
 * 转换 Markdown 为 b站专栏格式，会自动上传图片
 */
export async function markToBili(content: string): Promise<string> {
    // 图片上传队列
    const images: ImageInfo[] = [];
    // 生成一串随机前缀防止混淆，后续用于上传完毕后替换图片
    const imageTokenPrefix: string = `IMAGE-${Date.now()}-`;

    // 表格前缀
    const tableTokenPrefix: string = `TABLE-${Date.now()}-`;
    const tables: TableData[] = [];

    // marked consumes the backslashes in \(...\) and \[...\]. Replace all
    // supported delimiters with neutral tokens, then restore them in text().
    const formulas: string[] = [];
    const latexTokenPrefix = `BMDLATEX${Date.now()}${Math.floor(Math.random() * 1000000)}X`;
    content = stashLatex(content, formulas, latexTokenPrefix);

    marked.use({
        renderer: {
            heading(text) {
                // 标题
                const e = document.createElement('h1');
                e.innerHTML = text;
                return e.outerHTML;
            },
            del(text) {
                // 删除线
                const e = document.createElement('span');
                e.style.textDecoration = 'line-through';
                e.innerHTML = text;
                return e.outerHTML;
            },
            strong(text) {
                // 加粗
                const e = document.createElement('strong');
                e.innerHTML = text;
                return e.outerHTML;
            },
            blockquote(quote) {
                // 引用
                const e = document.createElement('blockquote');
                e.innerHTML = quote;
                return e.outerHTML;
            },
            hr() {
                return `<figure class="img-box" contenteditable="false"><img src="//i0.hdslb.com/bfs/article/4aa545dccf7de8d4a93c2b2b8e3265ac0a26d216.png" class="cut-off-2" _src="//i0.hdslb.com/bfs/article/4aa545dccf7de8d4a93c2b2b8e3265ac0a26d216.png"></figure>`;
            },
            list(body, ordered, start) {
                if (ordered) {
                    // 有序列表
                    const e = document.createElement('ol');
                    e.style.listStyleType = 'decimal';
                    e.className = 'list-paddingleft-2';
                    e.innerHTML = body;
                    return e.outerHTML;
                } else {
                    // 无序列表
                    const e = document.createElement('ul');
                    e.style.listStyleType = 'disc';
                    e.className = 'list-paddingleft-2';
                    e.innerHTML = body;
                    return e.outerHTML;
                }
            },
            listitem(text) {
                // 列表元素
                return `<li><p>${text}</p></li>`;
            },
            text(text) {
                return restoreLatex(text, formulas, latexTokenPrefix);
            },
            link(href, title, text) {
                let t = text || title || '';
                if (!href) {
                    return '';
                }
                // 过滤 t 内容，可能为图片
                const e = document.createElement('span');
                e.innerHTML = t;
                t = e.innerText;
                if (/https?:\/\/(.+\.)?bilibili\.com(\/.*)?/i.test(href)) {
                    // 站内链接
                    const e = document.createElement('a');
                    e.href = href;
                    if (t) {
                        e.innerText = t;
                    }
                    return e.outerHTML;
                } else {
                    // 站外链接，用颜色模拟，格式：【ALT】https://链接
                    const link = document.createElement('span');
                    link.className = 'color-blue-02';
                    link.innerText = href;
                    if (t && t !== href) {
                        const alt = document.createElement('span');
                        alt.className = 'color-pink-03';
                        alt.innerText = `【${t}】`;
                        return alt.outerHTML + link.outerHTML;
                    } else {
                        return link.outerHTML;
                    }
                }
            },
            image(href, title, text) {
                const t = text || title || '';
                if (href) {
                    const token = imageTokenPrefix + Math.random() + '-' + btoa(href);
                    // 加入上传队列
                    images.push({
                        token: token,
                        originUrl: href,
                        text: t
                    });
                    return `<p>${getPlaceholderImg(token)}</p>`;
                } else {
                    return '';
                }
            },
            code(code, lang, isEscaped) {
                // 代码，如果允许则返回高亮后的代码，否则返回 blockquote

                // 目前b站允许高亮的语言
                const ALLOWED_LANGUAGE: string[] = [
                    'c', 'c++', 'c#', 'css', 'dart',
                    'go', 'html', 'java', 'javascript', 'json',
                    'less', 'nginx', 'objective-c', 'php', 'python',
                    'r', 'ruby'
                ]
                if (!lang || !ALLOWED_LANGUAGE.includes(lang.toLowerCase())) {
                    // 未指定语言或语言不支持，返回 blockquote;
                    const e = document.createElement('blockquote');
                    e.innerHTML = transferParagraph(code);
                    return e.outerHTML;
                }
                const figure = document.createElement('figure');
                figure.className = 'code-box';
                figure.contentEditable = 'false';

                const pre = document.createElement('pre');
                pre.className = 'language-' + lang.toLowerCase();
                pre.dataset.lang = lang.toLowerCase();
                pre.setAttribute('codecontent', safeHTML(code));
                figure.appendChild(pre);

                const codeElement = document.createElement('code');
                codeElement.className = 'language-' + lang.toLowerCase();
                codeElement.innerText = code;
                // 高亮代码
                Prism.highlightElement(codeElement, false);
                pre.appendChild(codeElement);

                return figure.outerHTML;
            },
            /**
             * 以下是将会转换为特殊格式的 md 语法
             */
            em(text) {
                // 斜体，将使用灰色字体来模拟
                const e = document.createElement('span');
                e.innerHTML = text;
                e.className = 'color-gray-01';
                return e.outerHTML;
            },
            codespan(code) {
                // 行内代码，使用小号红色字体模拟
                const e = document.createElement('span');
                e.className = 'color-pink-03';
                e.innerHTML = code;
                return e.outerHTML;
            },
            /**
             * 以下是将会转换为纯文本的 md 语法
             */
            br() {
                return '<p></p>';
            },
            checkbox(checked) {
                return checked ? '✅': '⬜';
            },
            html(html) {
                return safeHTML(html);
            },
            paragraph(text) {
                return `<p>${text}</p>`;
            },
            table(header, body) {
                // 签名表格
                const token: string = tableTokenPrefix + Math.random() + '-' + CryptoJS.MD5(header + body).toString(CryptoJS.enc.Hex);
                // 生成表格数据
                // 分离行
                const rows = <TableCell[][]>body.split('\n').map((v) => {
                    // 分离单元格数据
                    const cells = v.split('\t').map((v) => {
                        if (v.trim()) {
                            return JSON.parse(v)
                        }
                    }).filter(v => v !== undefined);
                    return cells;
                }).filter(v => v.length > 0);
                // 分离头部数据
                const headers = header.split('\t').map(v => {
                    if (v.trim()) {
                        return JSON.parse(v).value;
                    }
                }).filter(v => v !== undefined);
                const table: TableData = {
                    token,
                    rows,
                    headers
                };
                tables.push(table);
                return getPlaceholderImg(token);
            },
            tablecell(content, {header, align}) {
                // 过滤 HTML 标签
                const temp = document.createElement('div');
                temp.innerHTML = content;
                const cell: TableCell = {
                    align: align || 'left',
                    value: temp.innerText
                }
                return JSON.stringify(cell) + '\t';
            },
            tablerow(content) {
                return content + '\n';
            },
            options: {}
        }
    });
    
    let result = marked(content);
    // A token can occur in a renderer other than text() (for example a
    // heading or a paragraph assembled by marked). Restore once more over
    // the complete generated HTML so no placeholder can leak to Bilibili.
    result = restoreLatex(result, formulas, latexTokenPrefix);
    // 异步上传图片
    images.forEach(v => {
        imageTask(v);
    })
    // 异步处理表格
    tables.forEach(v => {
        tableTask(v);
    })
    return result;
}
