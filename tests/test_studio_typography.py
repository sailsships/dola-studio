"""Keep the console independent of redistributed font assets."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_stylesheets_only_use_host_fonts():
    for name in ("shell.css", "console.css"):
        css = (ROOT / "web" / name).read_text(encoding="utf-8")
        assert not re.search(r"@font-face|fonts/|IBM Plex|Public Sans|Dola Sans SC", css)
        assert '"Segoe UI Variable Text"' in css
        assert '"Microsoft YaHei UI"' in css


def test_typography_release_invalidates_stylesheet_caches():
    html = (ROOT / "web/index.html").read_text(encoding="utf-8")
    build = json.loads((ROOT / "web/app/manifest.json").read_text(encoding="utf-8"))["build"]
    for name in ("shell.css", "console.css"):
        assert name + "?v=" + build in html


def test_no_bundled_font_files_remain():
    web = ROOT / "web"
    assert not any(p.suffix.lower() in {".ttf", ".otf", ".woff", ".woff2"} for p in web.rglob("*"))
    for name in ("OFL.txt", "dola-sans-sc-OFL.txt"):
        assert not (web / "fonts" / name).exists()
