"""Render paper charts and convert the canonical full results table to HTML.
Run with PyMuPDF available (PYTHONPATH=/tmp/motormind-figure-tools).
"""
from pathlib import Path
import html
import re
import pymupdf

SITE=Path(__file__).resolve().parents[1]
PAPER=SITE.parent/'ICLR2027-VLM4Robo/arxiv'
page=pymupdf.open(PAPER/'figs/teaser.pdf')[0]
for name,rect in [('base-results',(10,384,468,539)),('perturbation-results',(500,384,948,539))]:
    page.get_pixmap(matrix=pymupdf.Matrix(4,4),clip=pymupdf.Rect(rect),alpha=False).save(SITE/f'static/images/motormind/{name}.png')

source=(PAPER/'tbls/main_results.tex').read_text()
source=source[source.index('\\multicolumn{15}'):source.index('\\bottomrule')]
source=re.sub(r'%[^\n]*','',source)
rows=[]
last_method=''
for chunk in source.split('\\\\'):
    chunk=chunk.replace('\\midrule','').strip()
    if not chunk:continue
    if '\\multicolumn{15}' in chunk:
        group='Zero-Shot Methods' if 'Zero-Shot Methods' in chunk else 'Fine-Tuned Policies / Agentic Methods with Fine-Tuned Policies'
        rows.append(f'<tr class="result-group"><th colspan="15" scope="colgroup">{group}</th></tr>')
        continue
    cells=[c.strip() for c in chunk.split('&')]
    assert len(cells)==15, cells
    method=cells[0]
    method=re.sub(r'\\multirow(?:\[c\])?\{\d+\}\{\*\}\{(.*)\}',r'\1',method)
    method=method.replace('\\oursname{}','MotorMind').replace('$\\pi_{0.5}$','π₀.₅')
    if method:last_method=method
    else:method=last_method
    cells[0]=method
    def cell(value):
        value=html.escape(value)
        value=re.sub(r'\\best\{([^}]+)\}',r'<strong>\1</strong>',value)
        value=re.sub(r'\\second\{([^}]+)\}',r'<u>\1</u>',value)
        return '—' if value=='-' else value
    row='<tr'+(' class="result-ours"' if method.startswith('MotorMind') else '')+'>'
    row+='<th scope="row">'+cell(cells[0])+'</th>'
    row+=''.join('<td>'+cell(c)+'</td>' for c in cells[1:])+'</tr>'
    rows.append(row)
assert len(rows)==21,len(rows) # 19 method/configuration rows plus two groups
headers=['Goal','Spatial','Object','Avg.','Semantic','Object','Position','Task','Avg.','Time (s) ↓','Time score ↑','Time (s) ↓','Time score ↑']
table='''<h3 class="full-results-heading" id="full-results-heading">Full Results</h3>
      <div class="table-scroll full-results-scroll" role="region" aria-labelledby="full-results-heading" tabindex="0">
      <table class="full-results">
        <caption>LIBERO-PRO: success rates (%), episode wall time, and time-normalized success. Methods are grouped by whether the underlying policy uses task-specific fine-tuning.</caption>
        <thead><tr><th rowspan="2" scope="col">Method</th><th rowspan="2" scope="col">Configuration</th><th colspan="4" scope="colgroup">Base success rate (%)</th><th colspan="5" scope="colgroup">Perturbation success rate (%)</th><th colspan="2" scope="colgroup">Base efficiency</th><th colspan="2" scope="colgroup">Perturbation efficiency</th></tr><tr>'''+''.join('<th scope="col">'+h+'</th>' for h in headers)+'''</tr></thead>
        <tbody>'''+ '\n'.join(rows)+'''</tbody>
      </table></div>
      <p class="result-note">Time score = 60 × success rate (%) / episode wall time (s), in percentage points per minute. Bold and underlined values mark the best and second-best results within each group. A dash denotes an unreported result.</p>'''
charts='''<div class="main-result-charts">
        <figure><a href="./static/images/motormind/base-results.png" target="_blank" rel="noopener"><img src="./static/images/motormind/base-results.png" alt="Base task success: CaP-X 13.3%, MotorMind 66.7%, fine-tuned OpenVLA-OFT 98.3%, and fine-tuned pi 0.5 98.3%." loading="eager"></a></figure>
        <figure><a href="./static/images/motormind/perturbation-results.png" target="_blank" rel="noopener"><img src="./static/images/motormind/perturbation-results.png" alt="Perturbed task success: CaP-X 19.2%, MotorMind 53.8%, fine-tuned OpenVLA-OFT 51.2%, and fine-tuned pi 0.5 63.3%." loading="eager"></a></figure>
      </div>'''
p=SITE/'index.html'
s=p.read_text()
section=s.index('id="results"')
start=s.index('</p>',s.index('<p class="section-intro">',section))+4
end=s.index('    </div>\n  </section>',start)
s=s[:start]+'\n      '+charts+'\n      '+table+'\n'+s[end:]
p.write_text(s)
print('Rendered both paper charts; imported all 19 result rows and 13 numerical columns.')
