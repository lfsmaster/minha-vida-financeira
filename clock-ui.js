(function(global){
'use strict';
const Core=global.MVFClock;
const App={
 Core,
 $:id=>document.getElementById(id),
 money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),
 esc:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
 dateBR:value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'—',
 percent:value=>`${Math.round(Number(value)||0)}%`,
 categories:['Alimentação','Moradia','Transporte','Saúde','Educação','Lazer','Compras','Assinaturas','Salário','Renda extra','Dívidas','Investimentos','Poupança e metas','Outros'],
 routes:{dashboard:'Visão geral',transactions:'Movimentações',accounts:'Contas',cards:'Cartões',bills:'Pagar e receber',budget:'Orçamento',goals:'Metas',debts:'Dívidas',investments:'Investimentos',assets:'Patrimônio',health:'Saúde financeira',import:'Importar extrato',reports:'Relatórios',settings:'Configurações'},
 activePage:(location.hash||'#dashboard').slice(1),
 modalSubmit:null,
 importPreview:[],
 importFileName:'',
 renderers:{},
 actions:{}
};
if(!App.routes[App.activePage])App.activePage='dashboard';
App.state=()=>Core.getState();
App.toast=message=>{const node=App.$('toast');node.textContent=message;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),2600)};
App.accountOptions=(selected='')=>App.state().accounts.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${App.esc(a.name)}</option>`).join('');
App.cardOptions=(selected='')=>App.state().cards.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${App.esc(a.name)}</option>`).join('');
App.categoryOptions=(selected='Outros')=>App.categories.map(c=>`<option ${c===selected?'selected':''}>${c}</option>`).join('');
App.currentMonth=()=>App.$('monthFilter')?.value||new Date().toISOString().slice(0,7);
App.activeUser=()=>{const email=Core.session();return App.state().users.find(u=>u.email===email)};
App.setPage=page=>{App.activePage=App.routes[page]?page:'dashboard';location.hash=App.activePage;App.renderApp()};
App.openModal=(title,fields,onSubmit)=>{App.$('modalTitle').textContent=title;const form=App.$('modalForm');form.innerHTML=fields.map(field=>{const full=field.full?' full':'',required=field.required===false?'':' required';if(field.type==='select')return`<label class="field${full}">${App.esc(field.label)}<select name="${field.name}"${required}>${field.options}</select></label>`;if(field.type==='checkbox')return`<label class="checkbox${full}"><input type="checkbox" name="${field.name}" ${field.checked?'checked':''}><span>${App.esc(field.label)}</span></label>`;return`<label class="field${full}">${App.esc(field.label)}<input name="${field.name}" type="${field.type||'text'}" value="${App.esc(field.value||'')}" ${field.min!=null?`min="${field.min}"`:''} ${field.max!=null?`max="${field.max}"`:''} ${field.step?`step="${field.step}"`:''}${required}></label>`}).join('');App.modalSubmit=onSubmit;App.$('modalBack').classList.add('show');setTimeout(()=>form.querySelector('input,select')?.focus(),20)};
App.closeModal=()=>{App.$('modalBack').classList.remove('show');App.modalSubmit=null};
App.formObject=form=>{const data=new FormData(form),out={};for(const[key,value]of data.entries())out[key]=value;form.querySelectorAll('input[type=checkbox]').forEach(input=>out[input.name]=input.checked);return out};
App.showAuth=()=>{App.$('authScreen').classList.remove('hidden');App.$('appScreen').classList.add('hidden');const hasUsers=App.state().users.length>0;App.$('loginForm').classList.toggle('hidden',!hasUsers);App.$('registerForm').classList.toggle('hidden',hasUsers);App.$('authMessage').textContent=hasUsers?'Entre com sua conta local.':'Crie a primeira conta de acesso.'};
App.showApp=()=>{App.$('authScreen').classList.add('hidden');App.$('appScreen').classList.remove('hidden');document.documentElement.dataset.theme=App.state().settings.theme||'light';App.$('systemName').textContent=App.state().settings.systemName||'Minha Vida Financeira';App.$('userGreeting').textContent=`Olá, ${App.activeUser()?.name||App.state().settings.userName||'usuário'}`;App.renderNav();App.renderApp()};
App.render=()=>Core.session()&&App.activeUser()?App.showApp():App.showAuth();
App.renderNav=()=>{App.$('nav').innerHTML=Object.entries(App.routes).map(([key,label])=>`<button data-page="${key}" class="${App.activePage===key?'active':''}">${label}</button>`).join('')+'<button data-action="logout">Sair</button>';document.querySelectorAll('.mobile-nav [data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===App.activePage))};
App.renderApp=()=>{if(App.$('appScreen').classList.contains('hidden'))return;App.renderNav();App.$('pageTitle').textContent=App.routes[App.activePage];App.$('monthFilter').value=App.$('monthFilter').value||new Date().toISOString().slice(0,7);const renderer=App.renderers[App.activePage];App.$('pageRoot').innerHTML=renderer?renderer():'<div class="empty">Módulo indisponível.</div>'};
global.MVFApp=App;
})(window);
