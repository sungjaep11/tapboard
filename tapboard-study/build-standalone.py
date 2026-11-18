"""Bundle the buildless site as one offline HTML file. No dependencies."""
from pathlib import Path
import re
import sys

source = Path(__file__).resolve().parent / 'dist'
target = Path(sys.argv[1]) if len(sys.argv) > 1 else source.parent.parent / 'tapboard-test.html'
html = (source / 'index.html').read_text(encoding='utf-8')
# Local copies contain everything they need and never send users to hosting.
html = re.sub(r'<a\b[^>]*href="(?:https://[^\"]+/)?downloads/[^\"]+"[^>]*>.*?</a>', '', html)
html = html.replace('class="brand" href="./"', 'class="brand" href="#"')
html = html.replace('TYPING LAB</span>', 'TYPING LAB · LOCAL</span>')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (source / 'styles.css').read_text(encoding='utf-8') + '</style>')
scripts = []
for name in ['metrics.js', 'touch.js', 'phrases.js', 'app.js']:
    html = html.replace(f'<script src="{name}" defer></script>', '')
    scripts.append('<script>' + (source / name).read_text(encoding='utf-8') + '</script>')
target.write_text(html.replace('</body>', ''.join(scripts) + '</body>'), encoding='utf-8')
print(target)
