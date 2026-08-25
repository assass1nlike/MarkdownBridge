# Changelog

## 0.2.4

- Remove the duplicate `M` toolbar button from the new editor; use the page-level import button instead.

## 0.2.3

- Preserve Markdown heading levels when importing into the new editor.
- Remove `>` quote prefixes from multiline display formulas inside blockquotes.

## 0.2.2

- 修复 Markdown 一级至六级标题导入时全部被转换为 `<h1>` 的问题。
- 现在标题级别会按原 Markdown 层级写入 B 站编辑器。

## 0.2.1

- 修复生产版用户脚本导出时出现 `i is not a constructor` 的模块导入错误。

## 0.2.0

- 支持在 `https://www.bilibili.com/opus/<id>` 已发布图文页面直接导出 Markdown。
- 导出文件包含文章标题，并保留公开页正文中的格式、图片和图片说明。

## 0.1.0

- 增加从 B 站新版图文编辑器导出 Markdown 的反向转换功能。
- 支持标题、粗体、斜体、删除线、列表、引用、链接、图片、GFM 表格、代码块和原生分隔线。
- B 站独立公式导出为 `$$...$$`，行内公式导出为 `$...$`。
- 外层投稿页面增加“导出 MD”下载按钮。

## 0.0.13

- 将 Markdown `---` 转换为新版 B 站编辑器的原生 `<hr>` 分隔线，不再插入分隔线图片。

## 0.0.12

- 用逐字符状态机替换多组公式正则，保证 `$$` 块按出现顺序配对。
- 保留块级公式前后的换行，不再把公式压缩到普通文字同一行。
- 未找到闭合分隔符时保留原文，不产生半截或错误 TeX。

## 0.0.11

- 回滚 0.0.10 的块级公式匹配策略，恢复原有公式识别范围。
- 仅修复占位符未恢复时泄漏为 `BMDLATEX...END` 文本的问题。

## 0.0.9

- 修复块级公式占位符可能泄漏为 `BMDLATEX...END` 文本的问题。

## 0.0.8

- 将 `$$...$$` 和 `\[...\]` 识别为块级公式，自动在公式前后建立段落边界。

## 0.0.7

- 适配 B 站新版图文投稿地址 `/platform/upload/text/new-edit`。
- 增加外层“导入 MD”按钮与内层编辑器 `M` 按钮。
- 使用 `postMessage` 连接跨源隔离的 `/york/read-editor` iframe。
- 通过 Tiptap `setContent()` 写入内容，并提供 ProseMirror DOM 回退。
- 支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]` 公式分隔符。
- 输出新版编辑器识别的 `data-type="latex"`、`data-formula` 属性。
- 修正当前 Node.js 下的构建兼容性并移除上游自动更新地址。

## 0.0.3

- 上游版本，支持旧版 B 站专栏编辑器。
