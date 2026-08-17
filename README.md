# Markdown4Bilibili

将 Markdown 文档导入 B 站新版图文编辑器的 Tampermonkey 用户脚本，支持将常见 LaTeX 分隔符转换成 B 站原生公式节点。

当前适配地址：

```text
https://member.bilibili.com/platform/upload/text/new-edit
```

## 功能

- 从 `.md`、`.markdown` 或 `.txt` 文件导入文章。
- 支持标题、列表、引用、链接、代码块等常见 Markdown 格式。
- 支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]` 四种公式写法。
- 公式转换为新版编辑器识别的 `img[data-type="latex"][data-formula]` 节点。
- 同时提供外层页面的“导入 MD”按钮和编辑器工具栏中的 `M` 按钮。
- 通过 `postMessage` 跨越 B 站隔离的编辑器 iframe，不读取跨源对象。
- 保留旧版 `/platform/upload/text/edit` 编辑器的基础兼容。

## 安装

1. 为 Firefox、Chrome 或 Edge 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [`dist/bilibili-article-md.user.js`](dist/bilibili-article-md.user.js)，让 Tampermonkey 安装脚本。
3. 安装时允许脚本在以下两个地址运行：

   ```text
   https://member.bilibili.com/platform/upload/text/new-edit*
   https://member.bilibili.com/york/read-editor*
   ```

4. 打开 B 站图文投稿页。页面右上角会出现蓝色“导入 MD”按钮；内层编辑器加载完成后，工具栏也会出现 `M` 按钮。

如果升级过旧版本，请确认 Tampermonkey 中显示的版本号为 `0.0.13`，然后使用 `Ctrl+F5` 强制刷新投稿页。

## 公式示例

```markdown
行内公式：$x^2+y^2$ 或 \(x^2+y^2\)

块公式：
$$
E=mc^2
$$

或：
\[
E=mc^2
\]
```

代码块和行内代码中的公式分隔符不会被转换。

## 本地构建

需要 Node.js 18 或更高版本。在仓库根目录运行：

```bash
npm install --legacy-peer-deps
npm run build
```

构建产物：

- `dist/bilibili-article-md.user.js`：可直接安装的完整用户脚本。
- `dist/bilibili-article-md.meta.js`：用户脚本元数据。

旧版 `webpack-userscript` 与 webpack 5 存在 peer dependency 冲突，因此安装依赖时需要保留 `--legacy-peer-deps`。

## 工作原理

B 站新版编辑器位于隔离的 `/york/read-editor` iframe 中，外层投稿页不能直接读取其 `window.editor`。脚本会分别运行在外层页面和内层编辑器：外层负责选择文件，内层负责 Markdown 转换和 ProseMirror/Tiptap 写入，两者仅通过 `window.postMessage()` 通信。

## 开发与验证

```bash
npm run build
git diff --check
```

提交前请确认生成后的 `dist/bilibili-article-md.user.js` 中版本号与 `package.json` 一致。

## 来源与许可证

本项目基于 [codediy/bilibili-article-md](https://github.com/codediy/bilibili-article-md) 修改；其代码源自 Passkou 的实现。本项目继续使用 [MIT License](LICENSE)，并保留原作者版权声明。
