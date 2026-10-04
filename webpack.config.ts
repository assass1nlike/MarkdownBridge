
import webpack from 'webpack';
import fs from 'fs';
import path from 'path';
import WebpackUserscript from 'webpack-userscript';
import TerserWebpackPlugin from 'terser-webpack-plugin';

function getIcon64URL() {
    const icon = fs.readFileSync('./assets/icon64.png');
    return `data:image/png;base64,${icon.toString('base64')}`;
}

function getStyleURL() {
    return `data:text/css;base64,${fs.readFileSync('./src/style.css').toString('base64')}`
}

const isDebug: boolean = process.env.NODE_ENV === 'development';
// Keep installed userscripts and their download filenames stable across project renames.
const scriptName = 'bilibili-article-md';

const config: webpack.Configuration = {
    entry: './src/main.ts',
    output: {
        filename: isDebug ? `${scriptName}.dev.js` : `${scriptName}.js`,
        path: path.resolve(__dirname, isDebug ? './dev' : './dist')
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: ['ts-loader']
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.json', '.js'],
        // canvas-table is also published for Node and imports optional
        // `canvas`/`fs` modules. They are not needed in the browser userscript.
        fallback: {
            canvas: false,
            fs: false
        }
    },
    optimization: {
        minimizer: [<any>new TerserWebpackPlugin()]
    },
    plugins: [new WebpackUserscript({
        headers: {
            name: isDebug ? scriptName + '-new-edit-dev' : scriptName + '-new-edit',
            description: '在 B 站图文编辑器导入 Markdown，并从编辑页和已发布文章导出 Markdown',
            downloadURL: isDebug ? undefined : 'https://raw.githubusercontent.com/assass1nlike/MarkdownBridge/main/dist/bilibili-article-md.user.js',
            updateURL: isDebug ? undefined : 'https://raw.githubusercontent.com/assass1nlike/MarkdownBridge/main/dist/bilibili-article-md.meta.js',
            "run-at": 'document-end',
            include: '*://member.bilibili.com/platform/*',
            match: [
                'https://member.bilibili.com/platform/upload/text/new-edit*',
                'https://member.bilibili.com/york/read-editor*',
                'https://www.bilibili.com/opus/*'
            ],
            grant: [
                'GM_xmlhttpRequest',
                'GM_registerMenuCommand',
                'GM_getResourceURL',
                'GM_getResourceText',
                'unsafeWindow',
            ],
            connect: '*',
            resource: [
                'icon ' + getIcon64URL(),
                'style ' + getStyleURL()
            ],
            icon64: getIcon64URL(),
            namespace: 'codediy-new-edit-local'
        }
    })]
};
export default config;
