import webpack from 'webpack';
import fs from 'fs';
import path from 'path';
import WebpackUserscript from 'webpack-userscript';
import TerserWebpackPlugin from 'terser-webpack-plugin';

const isDebug = process.env.NODE_ENV === 'development';
const config: webpack.Configuration = {
    entry: './src/douyin.ts',
    output: {
        filename: isDebug ? 'douyin-article-md.dev.js' : 'douyin-article-md.js',
        path: path.resolve(__dirname, isDebug ? './dev' : './dist')
    },
    module: {
        rules: [{test: /\.ts$/, use: ['ts-loader']}]
    },
    resolve: {extensions: ['.ts', '.json', '.js']},
    optimization: {minimizer: [<any>new TerserWebpackPlugin()]},
    plugins: [new WebpackUserscript({
        headers: {
            name: 'Markdown4Douyin',
            downloadURL: isDebug ? undefined : 'https://raw.githubusercontent.com/assass1nlike/MarkdownBridge/main/dist/douyin-article-md.user.js',
            updateURL: isDebug ? undefined : 'https://raw.githubusercontent.com/assass1nlike/MarkdownBridge/main/dist/douyin-article-md.meta.js',
            version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
            description: '在抖音文章编辑器中导入 Markdown，并兼容 LaTeX 公式和明暗主题',
            namespace: 'assassinlike-markdown4douyin',
            author: 'assassinlike and contributors',
            'run-at': 'document-end',
            match: ['https://creator.douyin.com/*'],
            grant: []
        }
    })]
};
export default config;
