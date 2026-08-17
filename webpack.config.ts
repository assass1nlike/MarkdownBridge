
import webpack from 'webpack';
import fs from 'fs';
const package_ = JSON.parse(fs.readFileSync('package.json', {encoding: 'utf-8'}))
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

const config: webpack.Configuration = {
    entry: './src/main.ts',
    output: {
        filename: isDebug ? `${package_.name}.dev.js` : `${package_.name}.js`,
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
            name: isDebug ? package_.name + '-new-edit-dev' : package_.name + '-new-edit',
            "run-at": 'document-end',
            include: '*://member.bilibili.com/platform/*',
            match: [
                'https://member.bilibili.com/platform/upload/text/new-edit*',
                'https://member.bilibili.com/york/read-editor*'
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

