"""Joins the site into one file, dist/uconnect.html, which is what gets published on Claude.

Run it after changing anything:

    python3 build.py

It takes the page from index.html, puts styles.css in a <style> tag and puts every
script in one <script> tag, in the same order index.html loads them. The two
local-demo files are left out, because on Claude the real database is already there.
"""
import re
from pathlib import Path

LOCAL_ONLY = ['js/sample-data.js', 'js/local-demo.js']

root = Path(__file__).parent
index = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css' / 'styles.css').read_text(encoding='utf-8')

# Everything inside <body>, up to the comment just before the script tags.
body = index.split('<body data-mode="public">', 1)[1]
body = body.split('<!-- local demo only', 1)[0].strip()

# The Google Fonts links from <head>.
font_links = re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts[^>]*>', index)

# The scripts, in order.
script_paths = re.findall(r'<script src="(js/[^"]+)"></script>', index)
app_scripts = [path for path in script_paths if path not in LOCAL_ONLY]

code_parts = []
for path in app_scripts:
    code = (root / path).read_text(encoding='utf-8').strip()
    code_parts.append(f'// ---- {path} ----\n{code}')

# Inside one big <script>, text like "</body>" or "</script>" in a JS string confuses
# the browser and tools like VS Code Live Server (it adds its own script before every
# "</body>", which ended our script early and showed the code as text).
# In a JS string "<\/body>" means the same thing, but isn't a closing tag.
code = re.sub(r'</(?=(?:script|body|head|html|svg)\b)', r'<\\/', '\n\n'.join(code_parts), flags=re.I)

page = '\n'.join([
    '<title>UConnect</title>',
    *font_links,
    '<style>',
    css.strip(),
    '</style>',
    body,
    '<script>',
    code,
    '</script>',
    '',
])

(root / 'dist').mkdir(exist_ok=True)
output = root / 'dist' / 'uconnect.html'
output.write_text(page, encoding='utf-8')

size_kb = len(page.encode('utf-8')) / 1024
print(f'wrote {output.relative_to(root)} ({len(app_scripts)} scripts, {size_kb:.0f} KB)')
