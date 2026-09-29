'use strict';
const menu=document.getElementById('menu-toggle');
const sidebar=document.getElementById('sidebar');
const navigationToggle=document.getElementById('navigation-toggle');
function setNavigationHidden(hidden){
 document.body.classList.toggle('navigation-hidden',hidden);
 navigationToggle.setAttribute('aria-expanded',String(!hidden));
 navigationToggle.textContent=hidden?'☰ Show navigation':'← Hide navigation';
 try{localStorage.setItem('motormind.navigation-hidden',String(hidden));}catch{}
}
try{setNavigationHidden(localStorage.getItem('motormind.navigation-hidden')==='true');}catch{}
navigationToggle.addEventListener('click',()=>setNavigationHidden(!document.body.classList.contains('navigation-hidden')));
function closeMenu(){sidebar.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');}
menu.addEventListener('click',()=>{const open=sidebar.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
sidebar.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sidebar.classList.contains('open')){closeMenu();menu.focus();}});
const links=[...document.querySelectorAll('.nav-links a')];
const sections=links.map(link=>document.querySelector(link.getAttribute('href')));
let scheduled=false;
function updateSection(){let active=sections[0];for(const section of sections){if(section.getBoundingClientRect().top<=160)active=section;}for(const link of links){const match=link.hash==='#'+active.id;link.classList.toggle('active',match);if(match)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}scheduled=false;}
window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateSection);}},{passive:true});
window.addEventListener('resize',()=>{if(innerWidth>850)closeMenu();updateSection();});
updateSection();

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
