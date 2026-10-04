# MarkdownBridge

[MarkdownBridge](https://github.com/assass1nlike/MarkdownBridge) 是一组 Tampermonkey 用户脚本和本地工具，用于在 Markdown 文档与 B 站图文编辑器之间双向转换，并将 Markdown + LaTeX 文档生成抖音、小红书图文图片，支持小红书自动上传和发布前预览。

## B 站功能

用户脚本：[安装 B 站脚本](https://raw.githubusercontent.com/assass1nlike/MarkdownBridge/main/dist/bilibili-article-md.user.js)。文件为 `dist/bilibili-article-md.user.js`，沿用原脚本名和命名空间，以兼容已有安装。

- 在 B 站新版图文编辑器导入 `.md`、`.markdown` 或 `.txt` 文件。
- 支持 `$...$`、`$$...$$`、`\(...\)` 和 `\[...\]` 公式。
- 支持标题、粗体、斜体、删除线、列表、引用、链接、图片、表格、代码块和分隔线。
- 在编辑页和已发布的 `https://www.bilibili.com/opus/<id>` 页面导出 Markdown。

适配地址：

```text
https://member.bilibili.com/platform/upload/text/new-edit
https://www.bilibili.com/opus/<id>
```

## 抖音本地图文工具

The local renderer uses semantic pagination inspired by the open-source
`refineaidocs/markdown-to-pdf-beautifier` export pipeline: it creates fixed
`1080x1440` page containers first, then captures each container. Images, code
blocks and table rows stay intact. Long display formulas can cross pages at
safe line boundaries when moving them would leave excessive blank space. Display formulas can shrink to 24px
(the normal size is 30px); longer formulas use MathJax 4 for automatic line
breaking, including aligned equations. All math components load locally.

抖音页面对 LaTeX、SVG、CSS 和编辑器节点有限制，因此图文投稿采用本地渲染流程：

1. 本地读取 Markdown。
2. 使用 `marked` 解析 Markdown，使用 KaTeX 排版公式。
3. 使用本机 Chrome/Chromium 按 `1080x1440`（3:4）分页截图。
4. 将生成的 JPEG 文件手动上传到抖音“发布图文”。

本地渲染不会在抖音页面中执行，不依赖 Tampermonkey，也不会导致抖音页面卡顿。

### 安装依赖

需要 Node.js 18 或更高版本，并在仓库根目录执行：

```bash
npm install --legacy-peer-deps
```

### 生成图文图片

```bash
npm run render:douyin -- "C:\\path\\to\\article.md"
```

也可以指定输出目录：

```bash
npm run render:douyin -- "C:\\path\\to\\article.md" "C:\\path\\to\\output"
```

默认输出目录为 Markdown 文件旁边的 `<文件名>-douyin-images`，包含：

- `page-01.jpg`、`page-02.jpg` 等分页图片；
- `manifest.json`，记录页数、尺寸和公式数量；
- `render.html`，分页和长公式换行前的中间 HTML；最终效果以 JPEG 为准。

行内公式 `$...$` 和 `\(...\)` 支持同一段落内的源文件换行，包括引用段落；匹配不会跨越空行、标题、列表项或独立公式。代码中的公式标记保持原样。

块级公式默认最小字号为 24px。若整行缩放会低于这个值，就自动换行，优先保持原字号。可在 PowerShell 中调整阈值（大于 0，不超过原字号 30px），然后照常运行：

```powershell
$env:MATH_MIN_FONT_SIZE = "26"
npm run render:douyin -- "C:\\path\\to\\article.md" "D:\\path\\to\\output"
```

该设置也适用于小红书本地渲染。单个 `aligned` 推导式在正常换行后仍过宽时，会自动将首行左侧表达式独立成行，让后续等式使用整行宽度；原 Markdown 不变。多组独立等式不会使用此排版。无法安全拆分的超长单项会提示手动换行，不会缩到阈值以下；上下标仍使用数学排版所需的小字号。

正文中的独立公式放不下时，如果当前页底部空白超过正文可用高度的 25%（不计上下页边距），会在完整公式行之间分页，保留字号和对齐位置。分式、根式、矩阵等不能安全拆分的结构保持完整；引用和列表容器仍按原有规则分页。可调整阈值，数值越小越容易拆分，设为 `1` 关闭公式跨页拆分：

```powershell
$env:MATH_SPLIT_THRESHOLD = "0.25"
```

脚本默认最多生成 30 张图片。抖音当前页面显示最多支持 35 张，为保留余量，超过 30 张时会要求先拆分文档。可通过 `CHROME_PATH` 环境变量指定 Chrome/Chromium 可执行文件路径。

在抖音创作者中心打开“发布图文”（通常为 `https://creator.douyin.com/creator-micro/content/upload?default-tab=3`），选择生成目录中的所有 `page-*.jpg` 文件即可。脚本不会自动点击“发布”。

### 抖音文章导入脚本

`dist/douyin-article-md.user.js` 仍保留抖音“发布文章”编辑器的 Markdown 导入功能，但不负责图文截图。图文投稿请使用上面的本地命令。

## 小红书图文

复用本地 Markdown + KaTeX 渲染器生成 `1200×1600` 图片，使用 [white0dew/XiaohongshuSkills](https://github.com/white0dew/XiaohongshuSkills) 上传图片、填写标题和正文。`preview` 留在发布页面供人工检查；`publish` 会自动填写并点击发布。

需要 Node.js 18+、Python 3.10+、Git 和 Google Chrome。在仓库根目录安装依赖并首次登录：

```powershell
npm install --legacy-peer-deps
npm run xhs -- setup
npm run xhs -- login
```

在打开的 Chrome 中扫码登录。发布依赖、Python 虚拟环境及独立 Chrome 登录态放在仓库 `.local/xhs/`，不提交到 Git。发布工具固定使用上游提交 `67060c36cb840e771447887cb9617f147d2585d2`（MIT），通过 CLI 调用，不需要安装为 Agent Skill。Chrome 调试端口为 `9233`。

生成图片：

```powershell
npm run xhs -- render "D:\文章\article.md"
# 自定义输出位置和发布文案
npm run xhs -- render "D:\文章\article.md" --out "D:\图文\第一篇" --title "笔记标题" --content-file "D:\文章\简介.txt"
```

默认输出到仓库的 `output/xiaohongshu/<文件名>/`，包含分页 JPEG、渲染预览 `render.html`、`manifest.json` 和发布配置 `note.json`。标题默认取一级标题，正文默认是“全文见配图。”；可编辑 `note.json` 的 `title`、`content` 和 `images` 数组，图片按数组顺序上传，相对路径从配置文件所在目录解析。话题可写在正文最后一行，如 `#数学 #学习笔记`。

```powershell
# 自动上传并填表，最后由你在浏览器中点击发布
npm run xhs -- preview "D:\图文\第一篇"
# 或直接传 note.json
npm run xhs -- preview "D:\图文\第一篇\note.json"
# 明确需要自动提交时使用；重新执行会再次填表和提交
npm run xhs -- publish "D:\图文\第一篇"
```

本工具保守限制每篇 18 张图、标题 20 个 UTF-16 单位（常见中文各占一个，部分 emoji 占两个）、正文 1000 个单位；最终限制以平台页面为准。超限时提示修改，不截断内容。超过整页高度的段落、引用或代码块会报错，需在 Markdown 中拆分。公式在字体加载完成后按宽度缩放；KaTeX 和字体使用本机依赖，远程配图仍需联网。

已有 `note.json` 的输出目录不会被 `render` 覆盖，重排时请指定新的 `--out`。未登录时先运行 `login`；上传异常后检查浏览器页面。`publish` 完成表示发布工具的提交步骤返回成功，审核和最终发布状态请在小红书作品管理中确认。

## 开发与验证

```bash
npm test
npm run test:render
npm run test:xhs
npm run build
npm run build:douyin
git diff --check
```

小红书测试包括 Chrome 实际图片渲染、超宽公式和超高块校验，以及发布参数校验。运行 `setup` 后，还会测试上游发布流程的预览/提交分支；该测试模拟浏览器，不访问小红书或发布笔记。真实账号上传需要登录后执行 `preview` 验证。

## 许可证

本项目基于 [codediy/bilibili-article-md](https://github.com/codediy/bilibili-article-md) 修改，继续使用 [MIT License](LICENSE)。
