# Markdown4Bilibili

Markdown4Bilibili 是一组 Tampermonkey 用户脚本和本地工具，用于在 Markdown 文档与 B 站图文编辑器之间双向转换，并将 Markdown + LaTeX 文档生成适合抖音图文投稿的分页图片。

## B 站功能

用户脚本：`dist/bilibili-article-md.user.js`

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
- `render.html`，便于在本地浏览器检查渲染结果。

脚本默认最多生成 30 张图片。抖音当前页面显示最多支持 35 张，为保留余量，超过 30 张时会要求先拆分文档。可通过 `CHROME_PATH` 环境变量指定 Chrome/Chromium 可执行文件路径。

在抖音创作者中心打开“发布图文”（通常为 `https://creator.douyin.com/creator-micro/content/upload?default-tab=3`），选择生成目录中的所有 `page-*.jpg` 文件即可。脚本不会自动点击“发布”。

### 抖音文章导入脚本

`dist/douyin-article-md.user.js` 仍保留抖音“发布文章”编辑器的 Markdown 导入功能，但不负责图文截图。图文投稿请使用上面的本地命令。

## 开发与验证

```bash
npm test
npm run build
npm run build:douyin
git diff --check
```

## 许可证

本项目基于 [codediy/bilibili-article-md](https://github.com/codediy/bilibili-article-md) 修改，继续使用 [MIT License](LICENSE)。
