(function(){
'use strict';
const ICONS={
 dashboard:'◈',transactions:'↕',accounts:'◉',cards:'▣',bills:'✓',budget:'⌁',goals:'◎',debts:'↘',investments:'↗',assets:'◆',health:'♥',import:'⇧',reports:'▤',settings:'⚙'
};
function decorateNav(){
 const nav=document.getElementById('nav');
 if(!nav)return;
 nav.querySelectorAll('button[data-page]').forEach(button=>{
   const page=button.dataset.page;
   const label=button.textContent.trim();
   if(button.querySelector('.nav-icon'))return;
   button.innerHTML=`<span class="nav-icon" aria-hidden="true">${ICONS[page]||'•'}</span><span class="nav-label">${label}</span>`;
 });
 const logout=[...nav.querySelectorAll('button')].find(button=>!button.dataset.page&&button.textContent.trim().toLowerCase()==='sair');
 if(logout&&!logout.querySelector('.nav-icon'))logout.innerHTML='<span class="nav-icon" aria-hidden="true">↪</span><span class="nav-label">Sair</span>';
}
function decorateBrand(){
 const brand=document.querySelector('.side-brand');
 if(!brand||brand.querySelector('.creative-subbrand'))return;
 const content=brand.querySelector('div:last-child');
 if(!content)return;
 const subtitle=document.createElement('span');
 subtitle.className='creative-subbrand';
 subtitle.textContent='Creative Finance OS';
 const engine=content.querySelector('small');
 content.insertBefore(subtitle,engine||null);
}
function decorateTopbar(){
 const topbar=document.querySelector('.topbar');
 if(!topbar)return;
 const title=topbar.querySelector('#pageTitle');
 if(title&&title.parentElement&&!title.parentElement.querySelector('.creative-kicker')){
   const kicker=document.createElement('div');
   kicker.className='creative-kicker';
   kicker.textContent='Creative Finance OS';
   title.parentElement.insertBefore(kicker,title);
 }
 const actions=topbar.querySelector('.top-actions');
 if(actions&&!actions.querySelector('.creative-mode-badge')){
   const badge=document.createElement('span');
   badge.className='creative-mode-badge';
   badge.textContent='Creative mode';
   actions.insertBefore(badge,actions.firstChild);
 }
}
function decorate(){
 document.body.classList.add('creative-design');
 document.title='Minha Vida Financeira — Creative Finance OS';
 decorateBrand();
 decorateTopbar();
 decorateNav();
}
const nav=document.getElementById('nav');
if(nav)new MutationObserver(decorateNav).observe(nav,{childList:true});
window.addEventListener('hashchange',()=>requestAnimationFrame(decorate));
window.addEventListener('mvf:changed',()=>requestAnimationFrame(decorate));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
setTimeout(decorate,100);
setTimeout(decorate,500);
})();
