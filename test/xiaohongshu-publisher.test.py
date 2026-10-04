"""Exercise the pinned upstream pipeline with a fake browser; never visit XHS."""
import importlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.local/xhs/publisher/scripts'))
pipeline = importlib.import_module('publish_pipeline')


class PipelineTest(unittest.TestCase):
    def test_preview_and_explicit_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / '中文 图片.jpg'
            title = Path(directory) / 'title.txt'
            content = Path(directory) / 'content.txt'
            image.write_bytes(b'fixture')
            title.write_text('中文标题', encoding='utf-8')
            content.write_text('含空格的正文', encoding='utf-8')
            for preview in (True, False):
                publisher = MagicMock()
                publisher.check_login.return_value = True
                argv = ['pipeline', '--port', '9233', '--title-file', str(title),
                        '--content-file', str(content), '--images', str(image)]
                argv += ['--preview'] if preview else ['--auto-publish']
                with patch.object(sys, 'argv', argv), \
                     patch.object(pipeline, 'ensure_chrome', return_value=True), \
                     patch.object(pipeline, 'XiaohongshuPublisher', return_value=publisher):
                    pipeline.main()
                publisher.publish.assert_called_once_with(
                    title='中文标题', content='含空格的正文', image_paths=[str(image)], post_time=None)
                if preview:
                    publisher._click_publish.assert_not_called()
                else:
                    publisher._click_publish.assert_called_once()


if __name__ == '__main__':
    unittest.main()
