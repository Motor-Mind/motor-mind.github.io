'use strict';
const benchViewer=document.getElementById('bench-viewer');
let benchResizeObserver;
let initialSection=document.getElementById(location.hash.slice(1));
for(const event of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(event,()=>{initialSection=null;},{once:true,passive:true});
setTimeout(()=>{initialSection=null;},10000);
function alignInitialSection(){if(initialSection)initialSection.scrollIntoView({behavior:'instant',block:'start'});}

function sizeDiagnosticViewer(){
 const doc=benchViewer.contentDocument;
 if(!doc||doc.readyState!=='complete')return;
 if(benchResizeObserver)benchResizeObserver.disconnect();
 const resize=()=>{benchViewer.style.height=Math.ceil(doc.body.getBoundingClientRect().height)+2+'px';requestAnimationFrame(alignInitialSection);};
 benchResizeObserver=new ResizeObserver(resize);
 benchResizeObserver.observe(doc.body);
 resize();
}
benchViewer.addEventListener('load',sizeDiagnosticViewer);
sizeDiagnosticViewer();

// Re-align direct section links after the embedded diagnostic has loaded.
window.addEventListener('load',()=>{
 const target=document.getElementById(location.hash.slice(1));
 if(target)requestAnimationFrame(()=>requestAnimationFrame(()=>target.scrollIntoView({behavior:'instant',block:'start'})));
});

window.addEventListener("load",()=>{setTimeout(alignInitialSection,250);setTimeout(alignInitialSection,750);});

// Navigation and reading progress.
const menu = document.getElementById('menu-toggle');
const navigation = document.getElementById('page-navigation');
const links = [...document.querySelectorAll('.nav-links a')];
const sections = links.map(link => document.querySelector(link.hash));
function closeMenu() { navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation'); }
menu.addEventListener('click', () => { const open = navigation.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
links.forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && navigation.classList.contains('open')) { closeMenu(); menu.focus(); } });
let scheduled = false;
function updateSection() {
 let active = sections[0];
 sections.forEach(section => { if (section.getBoundingClientRect().top <= 170) active = section; });
 links.forEach(link => { const match = link.hash === '#' + active.id; link.classList.toggle('active', match); if (match) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
 const distance = document.documentElement.scrollHeight - innerHeight;
 document.querySelector('.reading-progress').style.transform = `scaleX(${distance > 0 ? Math.min(1, scrollY / distance) : 0})`;
 scheduled = false;
}
window.addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(updateSection); } }, {passive:true});
window.addEventListener('resize', () => { if (innerWidth > 850) closeMenu(); updateSection(); });
updateSection();

// Keep the original images as progressive-enhancement fallbacks and source views.
const figureLinks = [...document.querySelectorAll('figure a:has(img)')];
const viewer = document.getElementById('figure-viewer');
const viewerImage = document.getElementById('figure-image');
const viewport = document.querySelector('.figure-viewport');
let figureIndex = 0, zoom = 1, panX = 0, panY = 0, dragging = null, previousFocus;
function transformFigure() {
 viewerImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
 document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
 document.getElementById('zoom-out').disabled = zoom <= 1;
 document.getElementById('zoom-in').disabled = zoom >= 5;
}
function resetFigure() { zoom = 1; panX = panY = 0; transformFigure(); }
function showFigure(index) {
 figureIndex = (index + figureLinks.length) % figureLinks.length;
 const link = figureLinks[figureIndex], img = link.querySelector('img');
 viewerImage.src = link.href; viewerImage.alt = img.alt;
 document.getElementById('figure-title').textContent = `Figure ${figureIndex + 1} / ${figureLinks.length}`;
 document.getElementById('figure-caption').textContent = link.closest('figure').querySelector('figcaption')?.textContent || img.alt;
 document.getElementById('figure-original').href = link.href;
 resetFigure();
}
figureLinks.forEach((link, index) => {
 link.classList.add('figure-trigger');
 link.addEventListener('click', event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); previousFocus = link; showFigure(index); viewer.showModal(); document.body.style.overflow = 'hidden'; });
});
viewer.addEventListener('close', () => { document.body.style.overflow = ''; previousFocus?.focus(); });
document.getElementById('figure-close').onclick = () => viewer.close();
viewer.addEventListener('click', event => { if (event.target === viewer) { const r = viewer.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) viewer.close(); } });
document.getElementById('figure-prev').onclick = () => showFigure(figureIndex - 1);
document.getElementById('figure-next').onclick = () => showFigure(figureIndex + 1);
function changeZoom(delta) { zoom = Math.max(1, Math.min(5, zoom + delta)); if (zoom === 1) panX = panY = 0; transformFigure(); }
document.getElementById('zoom-in').onclick = () => changeZoom(.5);
document.getElementById('zoom-out').onclick = () => changeZoom(-.5);
document.getElementById('zoom-reset').onclick = resetFigure;
viewer.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); showFigure(figureIndex - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); showFigure(figureIndex + 1); } });
viewport.addEventListener('wheel', event => { event.preventDefault(); changeZoom(event.deltaY < 0 ? .15 : -.15); }, {passive:false});
viewport.addEventListener('pointerdown', event => { if (zoom <= 1) return; dragging = {x:event.clientX-panX,y:event.clientY-panY}; viewport.setPointerCapture(event.pointerId); });
viewport.addEventListener('pointermove', event => { if (!dragging) return; panX = event.clientX-dragging.x; panY = event.clientY-dragging.y; transformFigure(); });
['pointerup','pointercancel','lostpointercapture'].forEach(type => viewport.addEventListener(type, () => { dragging = null; }));

function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function selectControl(label, options) { const wrapper = element('label', '', label); const select = document.createElement('select'); select.setAttribute('aria-label',label); options.forEach(([value,text]) => select.add(new Option(text,value))); wrapper.append(select); return {wrapper,select}; }
function chartShell(title, description) {
 const root = element('div','interactive-chart'); const heading = element('div','chart-heading'); heading.append(element('h3','',title));
 const controls = element('div','chart-controls'), bars = element('div','chart-bars'), detail = element('p','chart-detail','Select a bar to inspect the result.'); detail.setAttribute('aria-live','polite');
 root.append(heading,element('p','chart-description',description),controls,bars,detail); return {root,controls,bars,detail};
}
function renderBars(chart, data, maximum, unit, metric) {
 chart.bars.replaceChildren(); chart.detail.textContent = 'Select a bar to inspect the result.';
 data.forEach(item => {
  const row = element('button','chart-row' + (item.ours ? ' ours' : '')); row.type = 'button';
  const track = element('span','bar-track'), fill = element('span','bar-fill');
  fill.style.setProperty('--value', Math.max(0,Math.min(100,item.value/maximum*100)) + '%'); track.append(fill); track.setAttribute('aria-hidden','true');
  const value = item.value.toLocaleString('en-US',{maximumFractionDigits:2}) + unit;
  row.append(element('span','bar-name',item.name),track,element('span','bar-value',value));
  row.setAttribute('aria-label', `${item.name}, ${metric}: ${value}. ${item.context || ''}`); row.setAttribute('aria-pressed','false');
  row.addEventListener('click', () => { chart.bars.querySelectorAll('button').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed','false'); }); row.classList.add('selected'); row.setAttribute('aria-pressed','true'); chart.detail.textContent = `${item.name} · ${metric}: ${value}${item.context ? ' · ' + item.context : ''}`; }); chart.bars.append(row);
 });
}
// Values come directly from the published tables, so charts and tables stay aligned.
const resultRows = [...document.querySelectorAll('.full-results tbody tr:not(.result-group)')].map(row => ({name:row.cells[0].textContent,config:row.cells[1].textContent,values:[...row.cells].map(cell => Number.parseFloat(cell.textContent)),ours:row.classList.contains('result-ours'),group:0}));
let group = 0, rowIndex = 0;
document.querySelectorAll('.full-results tbody tr').forEach(row => { if (row.classList.contains('result-group')) group++; else resultRows[rowIndex++].group = group; });
const featured = [resultRows.find(r => r.name.startsWith('CaP-X') && r.config === '10 loops'),resultRows.find(r => r.ours),resultRows.find(r => r.name === 'OpenVLA / OFT' && r.group === 1),resultRows.find(r => r.name === 'π₀.₅' && r.group === 1)];
const resultFigures = [...document.querySelectorAll('.main-result-charts figure')];
[['Base task success',5],['Under perturbations',10]].forEach(([title,column],index) => {
 const chart = chartShell(title,'LIBERO-PRO · Success rate (%) ↑');
 renderBars(chart,featured.map((r,i) => ({name:['CaP-X','MotorMind','OpenVLA / OFT','π₀.₅'][i],value:r.values[column],ours:r.ours,context:r.group === 1 ? 'Fine-tuned policy' : r.config === 'Zero-shot' ? 'Zero-shot method' : 'Zero-shot · ' + r.config})),100,'%',title);
 chart.root.append(element('p','chart-key','Teal: MotorMind · Gray: comparison methods. Select bars for training details.'));
 const source = resultFigures[index]; source.hidden = true; source.before(chart.root);
 const button = element('button','source-chart','View original chart ↗'); button.type = 'button'; button.onclick = () => { previousFocus = button; showFigure(figureLinks.indexOf(source.querySelector('a'))); viewer.showModal(); document.body.style.overflow = 'hidden'; }; chart.root.append(button);
});
const explorer = chartShell('Explore every method','Compare reported metrics across methods and configurations. Unreported values are omitted.');
const metric = selectControl('Metric', [['6','Base · Average (%)'],['2','Base · Goal (%)'],['3','Base · Spatial (%)'],['4','Base · Object (%)'],['11','Perturbation · Average (%)'],['7','Perturbation · Semantic (%)'],['8','Perturbation · Object (%)'],['9','Perturbation · Position (%)'],['10','Perturbation · Task (%)'],['12','Base · Time (s) ↓'],['13','Base · Time score ↑'],['14','Perturbation · Time (s) ↓'],['15','Perturbation · Time score ↑']]);
// Table cell indices include method and configuration: averages are cells 5 and 10.
const correctedColumns = {'6':5,'2':2,'3':3,'4':4,'11':10,'7':6,'8':7,'9':8,'10':9,'12':11,'13':12,'14':13,'15':14};
const methodGroup = selectControl('Methods',[['2','Zero-shot methods'],['1','Fine-tuned policies / tools'],['all','All methods']]);
const sort = selectControl('Order',[['reported','Reported order'],['descending','Highest first'],['ascending','Lowest first']]);
explorer.controls.append(metric.wrapper,methodGroup.wrapper,sort.wrapper);
function updateExplorer() {
 const column = correctedColumns[metric.select.value]; const percent = column <= 10;
 let data = resultRows.filter(r => (methodGroup.select.value === 'all' || r.group === +methodGroup.select.value) && Number.isFinite(r.values[column])).map(r => ({name:r.name,value:r.values[column],ours:r.ours,context:r.config + ' · ' + (r.group === 1 ? 'Fine-tuned policy / tool' : 'Zero-shot method')}));
 if (sort.select.value !== 'reported') data.sort((a,b) => sort.select.value === 'descending' ? b.value-a.value : a.value-b.value);
 renderBars(explorer,data,percent ? 100 : Math.max(1,...data.map(r=>r.value)),percent ? '%' : [11,13].includes(column) ? 's' : '',metric.select.selectedOptions[0].textContent);
}
[metric.select,methodGroup.select,sort.select].forEach(select => select.onchange = updateExplorer);
document.querySelector('.main-result-charts').after(explorer.root); updateExplorer();
const diagnostic = chartShell('Compare decision capabilities','240 visual questions · Select a capability or compare inference latency.');
const capability = selectControl('Measure',[['4','Overall accuracy'],['1','Action selection'],['2','Progress assessment'],['3','Subgoal completion'],['5','Latency (ms) ↓']]); diagnostic.controls.append(capability.wrapper);
function updateDiagnostic() { const col = +capability.select.value; const data = [...document.querySelectorAll('.diagnostic-results tbody tr')].map(row=>({name:row.cells[0].textContent,value:+row.cells[col].textContent,context:col === 5 ? 'Mean inference time per query' : col === 4 ? '240 questions overall' : '80 questions per capability'})); renderBars(diagnostic,data,col===5 ? Math.max(...data.map(r=>r.value)) : 100,col===5 ? ' ms' : '%',capability.select.selectedOptions[0].textContent); }
capability.select.onchange = updateDiagnostic; document.querySelector('.diagnostic-results-heading').after(diagnostic.root); updateDiagnostic();
const adaptive = chartShell('Adaptation by task','Success rates across four adaptive task groups.');
const adaptiveData = [...document.querySelectorAll('.task-groups article')].map(article=>({name:article.querySelector('h3').textContent,value:parseFloat(article.querySelector('span').textContent),context:article.querySelector('span').textContent.split('·')[1].trim() + ' · ' + article.querySelector('p').textContent,ours:true}));
renderBars(adaptive,adaptiveData,100,'%','Success rate'); document.querySelector('.adaptive-layout').after(adaptive.root);
// Search long tables without changing their source data or group membership.
document.querySelectorAll('.table-scroll').forEach((region,index) => {
 const rows = [...region.querySelectorAll('tbody tr:not(.result-group)')];
 const tools = element('div','table-tools'); const label = element('label','','Filter results '); const input = document.createElement('input'); input.type='search'; input.placeholder='Search model or configuration…'; input.id='table-filter-'+index; label.htmlFor=input.id; label.append(input); const count=element('span'); count.setAttribute('aria-live','polite'); tools.append(label,count); region.before(tools);
 function filter() { let shown=0; rows.forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(input.value.trim().toLowerCase()); if(!row.hidden) shown++;}); region.querySelectorAll('.result-group').forEach(header=>{let next=header.nextElementSibling, any=false;while(next&&!next.classList.contains('result-group')){if(!next.hidden)any=true;next=next.nextElementSibling;}header.hidden=!any;}); count.textContent=`${shown} of ${rows.length} results`; }
 input.addEventListener('input',filter); filter();
});
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
 const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('reveal');observer.unobserve(entry.target);}}),{threshold:.08});
 document.querySelectorAll('.paper-figure,.interactive-chart,.principles article,.real-stats').forEach(node=>observer.observe(node));
}

// Interactive companion to Figure 4, using the same table as the bar charts.
const efficiency = chartShell('Explore the success–time trade-off','Higher is more successful; farther left is faster. Hover, focus, or select a point for its exact result.');
const condition = selectControl('Evaluation',[['base','Base tasks'],['perturbation','Perturbations']]);
const efficiencyGroup = selectControl('Policy group',[['2','Zero-shot methods'],['1','Fine-tuned policies / tools']]);
const pointChoice = selectControl('Inspect method',[]);
efficiency.controls.append(condition.wrapper,efficiencyGroup.wrapper,pointChoice.wrapper);
const plot = element('div','scatter-plot'); plot.setAttribute('role','group'); plot.setAttribute('aria-label','Success rate versus episode wall time');
efficiency.bars.replaceWith(plot);
const xLabel=element('p','scatter-x','Mean episode wall time (seconds) →');
plot.after(xLabel);
function updateEfficiency() {
 const base = condition.select.value === 'base', successCol=base ? 5 : 10, timeCol=base ? 11 : 13;
 const rows=resultRows.filter(r=>r.group===+efficiencyGroup.select.value&&Number.isFinite(r.values[successCol])&&Number.isFinite(r.values[timeCol]));
 const maxTime=Math.ceil(Math.max(...rows.map(r=>r.values[timeCol]))/100)*100;
 plot.replaceChildren(); pointChoice.select.replaceChildren();
 for(let value=0;value<=100;value+=25){const line=element('div','scatter-grid');line.style.bottom=value+'%';line.append(element('span','',value+'%'));plot.append(line);}
 for(let i=0;i<=4;i++){const tick=element('span','scatter-tick',String(Math.round(maxTime*i/4)));tick.style.left=i*25+'%';plot.append(tick);}
 const ours=resultRows.find(r=>r.ours);const reference=element('div','scatter-reference');reference.style.bottom=ours.values[successCol]+'%';reference.append(element('span','','MotorMind '+ours.values[successCol]+'%'));plot.append(reference);
 rows.forEach((r,index)=>{
  const name=r.name+' · '+r.config, detail=`${name} — ${r.values[successCol]}% success · ${r.values[timeCol]} s per episode · ${r.values[base?12:14]} pp/min`;
  pointChoice.select.add(new Option(name,String(index)));
  const point=element('button','scatter-point'+(r.ours?' ours':''));point.type='button';point.style.left=r.values[timeCol]/maxTime*100+'%';point.style.bottom=r.values[successCol]+'%';point.setAttribute('aria-label',detail);point.title=detail;
  const selectPoint=()=>{plot.querySelectorAll('.scatter-point').forEach(p=>p.classList.remove('selected'));point.classList.add('selected');efficiency.detail.textContent=detail;pointChoice.select.value=String(index);};
  point.onclick=selectPoint;point.onfocus=selectPoint;point.onmouseenter=selectPoint;plot.append(point);
 });
 pointChoice.select.onchange=()=>{const points=plot.querySelectorAll('.scatter-point');points[+pointChoice.select.value].click();};
 pointChoice.select.value=String(Math.max(0,rows.findIndex(r=>r.ours)));pointChoice.select.onchange();
}
condition.select.onchange=updateEfficiency;efficiencyGroup.select.onchange=updateEfficiency;
document.querySelector('#efficiency-results .paper-figure').before(efficiency.root);updateEfficiency();

// Replay the opening choreography without reloading data or changing scroll position.
const introMotion = matchMedia('(prefers-reduced-motion: reduce)');
const replayIntro = document.getElementById('replay-intro');
let introFrame;
function updateIntroPreference() {
 replayIntro.hidden = introMotion.matches;
 if (introMotion.matches) {
  cancelAnimationFrame(introFrame);
  document.documentElement.classList.remove('entrance-ready');
 }
}
updateIntroPreference();
introMotion.addEventListener('change', updateIntroPreference);
replayIntro.addEventListener('click', () => {
 if (introMotion.matches) return;
 cancelAnimationFrame(introFrame);
 document.documentElement.classList.remove('entrance-ready');
 introFrame = requestAnimationFrame(() => {
  introFrame = requestAnimationFrame(() => document.documentElement.classList.add('entrance-ready'));
 });
});
// Reveal immediately when a visitor starts navigating during the intro.
function finishIntro() {
 cancelAnimationFrame(introFrame);
 document.documentElement.classList.remove('entrance-ready');
}
window.addEventListener('keydown', event => { if (['Tab','Escape'].includes(event.key)) finishIntro(); });
window.addEventListener('wheel', finishIntro, {passive:true});
window.addEventListener('touchstart', finishIntro, {passive:true});
