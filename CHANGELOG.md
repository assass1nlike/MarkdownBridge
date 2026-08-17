# Changelog

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
