"""Bundle the approved viewer and its images into the paper website."""
import hashlib
import json
import re
import shutil
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
SOURCE = SITE.parent / 'embodied-decision-benchmark'
DEST = SITE / 'static/decision-bench'
DEST.mkdir(parents=True, exist_ok=True)
(DEST / 'images').mkdir(exist_ok=True)
html = (SOURCE / 'viewer/index.html').read_text()
pattern = r'(<script id="dataset" type="application/json">)(.*?)(</script>)'
match = re.search(pattern, html, re.S)
data = json.loads(match[2])
for item in data['items']:
    for key in ('images', 'hd_images'):
        for i, path in enumerate(item[key]):
            if path is None:
                continue
            original = SOURCE / path
            name = hashlib.sha256(path.encode()).hexdigest()[:20] + original.suffix
            shutil.copy2(original, DEST / 'images' / name)
            item[key][i] = 'images/' + name
html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + html[match.end(2):]
html = html.replace("img.src='../'+path", "img.src='./'+path")
html = re.sub(r'<header>.*?</header>', '<header><div class="nav"><button id="language" aria-label="Switch language">中文</button></div></header>', html, flags=re.S)
html = html.replace('<h1>Diagnose Viewer</h1>', '')
html = html.replace('<p id="subtitle"></p>', '<p id="subtitle" hidden></p>')
html = html.replace('<div class="stats" id="stats"></div>', '<div class="stats" id="stats" hidden></div>')
html = re.sub(r'<div class="footer">Decision Bench.*?</div>', '<span id="source-note" hidden></span>', html)
html = html.replace('</style>', '''
body{background:#fff}header{border:0}.nav{padding:0 0 12px;justify-content:flex-end}.wrap{padding:0;max-width:none}.intro{display:none}:root{--blue:#167ca6;--tint:#edf5f8}.panel{box-shadow:none}.footer{margin-bottom:0}
</style>''')
html = html.replace('Decision Bench · Diagnose Viewer', 'MotorMind · Decision Diagnostic').replace('Decision Bench diagnose viewer', 'Decision Diagnostic examples')
(DEST / 'viewer.html').write_text(html)
print(f'Bundled {len(data["items"])} items and their original and HD images.')
