const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {validateNote, pipelineArgs, main} = require('../tools/xiaohongshu');
const {renderImages} = require('../tools/render-douyin-images');

test('preview is explicit; ordered paths and text files stay separate arguments', () => {
    const images = ['D:\\文章 图片\\page-02.jpg', 'D:\\文章 图片\\page-01.jpg'];
    const args = pipelineArgs('preview', 'D:\\文章 图片', images);
    assert.ok(args.includes('--preview'));
    assert.ok(!args.includes('--auto-publish'));
    assert.deepEqual(args.slice(args.indexOf('--images') + 1), images);
    assert.ok(pipelineArgs('publish', '.', images).includes('--auto-publish'));
    assert.throws(() => pipelineArgs('typo', '.', images));
});

test('validate all media before launching a publisher; never truncate the title', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md4b-xhs-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    fs.writeFileSync(path.join(dir, '01.jpg'), 'fixture');
    const note = {title: '原始标题', content: '原始正文', images: ['01.jpg']};
    assert.deepEqual(validateNote(note, dir).images, [path.join(dir, '01.jpg')]);
    assert.throws(() => validateNote({...note, images: ['missing.jpg']}, dir), /图片不可用/);
    assert.throws(() => validateNote({...note, title: '字'.repeat(21)}, dir), /20/);
    assert.throws(() => validateNote({...note, title: '😀'.repeat(11)}, dir), /20/);
    assert.throws(() => validateNote({...note, content: '字'.repeat(1001)}, dir), /1000/);
    assert.throws(() => validateNote({...note, images: Array(19).fill('01.jpg')}, dir), /18/);
});

test('unknown command cannot fall through to publish', async () => {
    await assert.rejects(main(['pubish', '.']), /未知命令/);
    await assert.rejects(main(['preview']), /提供/);
});

test('renderer fits wide formulas, produces 1200x1600 JPEGs and rejects an oversized block', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md4b-render-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const input = path.join(dir, 'article.md');
    const math = '$$\n' + Array(40).fill('x_i^2').join(' + ') + '\n$$';
    fs.writeFileSync(input, '# 数学测试\n\n' + Array(20).fill('普通文字与行内公式 $x^2$。\n\n' + math).join('\n\n'));
    const output = path.join(dir, 'images');
    const result = await renderImages(input, output, {scale: 1200 / 1080, maxImages: 18});
    assert.equal(result.formulas, 40);
    assert.ok(result.pages > 1);
    for (const file of result.images) {
        const bytes = fs.readFileSync(path.join(output, file));
        assert.ok(bytes.length > 10000, 'page must contain content');
        // Read JPEG SOF dimensions independently of the renderer manifest.
        let found = false;
        for (let i = 2; i < bytes.length;) {
            const marker = bytes[i + 1];
            if (marker === 0xc0 || marker === 0xc2) {
                assert.equal(bytes.readUInt16BE(i + 5), 1600);
                assert.equal(bytes.readUInt16BE(i + 7), 1200);
                found = true; break;
            }
            i += 2 + bytes.readUInt16BE(i + 2);
        }
        assert.ok(found, 'JPEG size marker must exist');
    }
    fs.writeFileSync(input, '# 太长的代码块\n\n```\n' + 'long code line\n'.repeat(100) + '```');
    await assert.rejects(renderImages(input, path.join(dir, 'oversized')), /超出页面/);
});

const python = path.resolve(__dirname, '../.local/xhs/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
test('installed upstream preview/publish branches (mock browser, no network or posting)', {skip: !fs.existsSync(python)}, () => {
    execFileSync(python, [path.join(__dirname, 'xiaohongshu-publisher.test.py')], {stdio: 'pipe'});
});
