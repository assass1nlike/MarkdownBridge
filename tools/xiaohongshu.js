// Markdown image notes, with publishing delegated to XiaohongshuSkills (MIT).
const fs = require('fs');
const path = require('path');
const {spawnSync, execFileSync} = require('child_process');
const {parseArgs} = require('util');
const {renderImages} = require('./render-douyin-images');

const ROOT = path.resolve(__dirname, '..');
const LOCAL = path.join(ROOT, '.local', 'xhs');
const PUBLISHER = path.join(LOCAL, 'publisher');
const REVISION = '67060c36cb840e771447887cb9617f147d2585d2';
const REPOSITORY = 'https://github.com/white0dew/XiaohongshuSkills.git';
const PYTHON = path.join(LOCAL, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const MAX_IMAGES = 18; // Conservative local limit; the platform may allow a different count.
const PORT = '9233';

function run(command, args, cwd = ROOT) {
    const result = spawnSync(command, args, {cwd, stdio: 'inherit', shell: false,
        env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`命令失败（退出码 ${result.status}）。若尚未登录，请运行 npm run xhs -- login，扫码后重试。`);
}

function checkRevision() {
    const actual = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: PUBLISHER, encoding: 'utf8'}).trim();
    if (actual !== REVISION) throw new Error(`发布依赖版本不匹配：需要 ${REVISION}，实际 ${actual}。`);
}

function setup() {
    fs.mkdirSync(LOCAL, {recursive: true});
    if (!fs.existsSync(PUBLISHER)) {
        run('git', ['init', PUBLISHER]);
        run('git', ['remote', 'add', 'origin', REPOSITORY], PUBLISHER);
        run('git', ['fetch', '--depth', '1', 'origin', REVISION], PUBLISHER);
        run('git', ['checkout', '--detach', 'FETCH_HEAD'], PUBLISHER);
    }
    checkRevision();
    if (!fs.existsSync(PYTHON)) run(process.env.XHS_PYTHON || 'python', ['-m', 'venv', path.join(LOCAL, 'venv')]);
    run(PYTHON, ['-m', 'pip', 'install', '-r', path.join(PUBLISHER, 'requirements.txt')]);
    const accountFile = path.join(PUBLISHER, 'config', 'accounts.json');
    if (!fs.existsSync(accountFile)) {
        fs.mkdirSync(path.dirname(accountFile), {recursive: true});
        fs.writeFileSync(accountFile, JSON.stringify({default_account: 'default', accounts: {
            default: {alias: 'MarkdownBridge', profile_dir: path.join(LOCAL, 'chrome-profile'), created_at: null},
        }}, null, 2));
    }
    console.log('安装完成。运行 npm run xhs -- login，在打开的 Chrome 中扫码登录。');
}

function requirePublisher() {
    if (!fs.existsSync(PYTHON) || !fs.existsSync(path.join(PUBLISHER, 'scripts', 'publish_pipeline.py'))) {
        throw new Error('请先运行 npm run xhs -- setup 安装发布依赖。');
    }
    checkRevision();
}

function validateNote(note, directory) {
    if (typeof note.title !== 'string' || !note.title.trim()) throw new Error('请在 note.json 中填写 title。');
    // UTF-16 length matches the publisher/editor convention, including emoji.
    if (note.title.trim().length > 20) throw new Error('标题超过 20 个 UTF-16 单位，请在 note.json 中缩短 title。');
    if (typeof note.content !== 'string' || !note.content.trim()) throw new Error('请在 note.json 中填写 content。');
    if (note.content.trim().length > 1000) throw new Error('正文超过本工具的 1000 字限制，请将全文保留在配图中，并缩短 content。');
    if (!Array.isArray(note.images) || !note.images.length || note.images.length > MAX_IMAGES) {
        throw new Error(`图片数量必须为 1–${MAX_IMAGES} 张，请拆分笔记。`);
    }
    const images = note.images.map(file => {
        if (typeof file !== 'string') throw new Error('images 必须是图片路径数组。');
        const resolved = path.resolve(directory, file);
        if (!/\.(jpe?g|png|webp)$/i.test(resolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            throw new Error(`图片不可用：${resolved}`);
        }
        return resolved;
    });
    return {title: note.title.trim(), content: note.content.trim(), images};
}

function pipelineArgs(mode, directory, images) {
    if (!['preview', 'publish'].includes(mode)) throw new Error(`不支持的发布模式：${mode}`);
    return [path.join(PUBLISHER, 'scripts', 'publish_pipeline.py'),
        '--port', PORT, '--title-file', path.join(directory, 'title.txt'),
        '--content-file', path.join(directory, 'content.txt'),
        ...(mode === 'preview' ? ['--preview'] : ['--auto-publish']), '--images', ...images];
}

async function main(args = process.argv.slice(2)) {
    const {values, positionals} = parseArgs({args, allowPositionals: true, options: {
        out: {type: 'string'}, title: {type: 'string'}, 'content-file': {type: 'string'},
        help: {type: 'boolean'},
    }});
    const [command, input] = positionals;
    if (!command || values.help) {
        console.log(`小红书图文工具（Node.js 18+ / Python 3.10+ / Chrome / Git）
  npm run xhs -- setup
  npm run xhs -- login
  npm run xhs -- render article.md [--out D:\\output] [--title 标题] [--content-file 正文.txt]
  npm run xhs -- preview <输出目录或 note.json>  自动填充，留在发布前
  npm run xhs -- publish <输出目录或 note.json>  自动填充并提交

render 默认输出到仓库 output/xiaohongshu/<文件名>。生成后可编辑 note.json 的标题、正文、图片顺序。
preview/publish 使用独立 Chrome 登录态（端口 ${PORT}），首次需运行 login 扫码。`);
        return;
    }
    if (command === 'setup') return setup();
    if (command === 'login') {
        requirePublisher();
        return run(PYTHON, [path.join(PUBLISHER, 'scripts', 'cdp_publish.py'), '--port', PORT, 'login']);
    }
    if (command === 'render') {
        if (!input) throw new Error('请提供 Markdown 文件路径。');
        const output = path.resolve(values.out || path.join(ROOT, 'output', 'xiaohongshu', path.parse(input).name));
        const noteFile = path.join(output, 'note.json');
        if (fs.existsSync(noteFile)) throw new Error('此目录已有 note.json，请用 --out 指定新目录，以保留已编辑的文案。');
        const content = values['content-file'] ? fs.readFileSync(values['content-file'], 'utf8').trim() : '全文见配图。';
        const result = await renderImages(input, output, {scale: 1200 / 1080, maxImages: MAX_IMAGES});
        const note = {title: values.title || result.title || path.parse(input).name, content, images: result.images};
        fs.writeFileSync(noteFile, JSON.stringify(note, null, 2) + '\n');
        console.log(`已生成 ${result.pages} 张 ${result.width}×${result.height} 图片：${output}\n请检查图片并编辑 ${noteFile}，然后运行 npm run xhs -- preview "${output}"`);
        return result;
    }
    if (['preview', 'publish'].includes(command)) {
        if (!input) throw new Error('请提供图片输出目录或 note.json。');
        const noteFile = fs.statSync(input).isDirectory() ? path.join(input, 'note.json') : input;
        const directory = path.dirname(path.resolve(noteFile));
        const note = validateNote(JSON.parse(fs.readFileSync(noteFile, 'utf8')), directory);
        requirePublisher();
        fs.writeFileSync(path.join(directory, 'title.txt'), note.title);
        fs.writeFileSync(path.join(directory, 'content.txt'), note.content);
        run(PYTHON, pipelineArgs(command, directory, note.images), PUBLISHER);
        console.log(command === 'preview' ? '表单填充完成，请在 Chrome 中检查并手动发布。' : '发布工具已完成提交操作，请在小红书作品管理中确认结果。');
        return;
    }
    throw new Error(`未知命令：${command}，请运行 npm run xhs -- --help。`);
}

module.exports = {main, validateNote, pipelineArgs};
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
