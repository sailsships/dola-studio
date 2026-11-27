"""The public UI bundle, four README editions and localization catalogs agree."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_four_locales_cover_active_ui_and_keep_placeholders():
    import i18n_tool
    keys = i18n_tool.catalog()
    for lang in ('en', 'ja', 'ko'):
        data = i18n_tool.load_locale(lang)
        assert all(data.get(k) for k in keys)
        assert i18n_tool.placeholder_errors(data) == []
        assert not any(c in value for value in data.values() for c in '⟦⟧⟪⟫')


def test_hashed_modules_match_actual_files_and_references():
    manifest = json.loads((ROOT / 'web/app/manifest.json').read_text())
    html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
    assert manifest['build'] == '1.0.1'
    for name in manifest['order']:
        match = re.search(r'\.([0-9a-f]{12})\.js$', name)
        if match:
            assert hashlib.sha256((ROOT / 'web' / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest().startswith(match[1]), name
        assert html.count(name + '?') == 2, name


def test_readme_languages_share_protocol_examples_and_top_navigation():
    chinese = (ROOT / 'README.md').read_text(encoding='utf-8')
    blocks = lambda s: re.findall(r'```[^\n]*\n[\s\S]*?```', s)
    for name in ('README.md', 'README.en.md', 'README.ja.md', 'README.ko.md'):
        text = (ROOT / name).read_text(encoding='utf-8')
        assert blocks(text) == blocks(chinese)
        navigation = text[:text.index('<a id="overview">')]
        for label in ('中文', 'English', '日本語', '한국어'):
            assert label in navigation
        assert 'docs/assets/creation-workbench.png' in text
        for anchor in ('modes', 'quick-start', 'api', 'documentation', 'license'):
            assert f'<a id="{anchor}">' in text
        assert '647127178' in text
        assert '[LICENSE](LICENSE)' in text


def test_language_and_theme_never_reload_or_call_business_apis():
    for name in ('i18n/i18n.js', 'preferences.js'):
        source = (ROOT / 'web' / name).read_text(encoding='utf-8')
        assert 'location.reload' not in source
        assert '/api/' not in source
        assert 'method:' not in source
    css = (ROOT / 'web/preferences.css').read_text(encoding='utf-8')
    assert 'filter:invert' not in css
    assert 'color-scheme:dark' in css
