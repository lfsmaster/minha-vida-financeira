(function(App){
'use strict';
const {Core,$,state,toast,openModal,closeModal,formObject,accountOptions,cardOptions,categoryOptions,currentMonth}=App;
function txFields(kind) {
  return [
    { name: 'date', label: 'Data', type: 'date', value: Core.today() },
    { name: 'description', label: 'Descrição', full: true },
    {
      name: 'category',
      label: 'Categoria',
      type: 'select',
      options: categoryOptions(kind === 'income' ? 'Renda extra' : 'Outros')
    },
    { name: 'amount', label: 'Valor', type: 'number', min: 0.01, step: '.01' },
    {
      name: 'accountId',
      label: 'Conta',
      type: 'select',
      options: accountOptions()
    },
    {
      name: 'status',
      label: 'Situação',
      type: 'select',
      options: '<option value="paid">Realizado</option><option value="pending">Pendente</option>'
    }
  ];
}
App.handleAction=(action,id)=>{try{
 if(action==='logout'){Core.logout();App.render();return}
 if(action==='add-income'||action==='add-expense'){const kind=action==='add-income'?'income':'expense';openModal(kind==='income'?'Nova receita':'Nova despesa',txFields(kind),data=>Core.dispatch('ADD_TRANSACTION',{...data,kind,amount:Number(data.amount)}));return}
 if(action==='add-account'){openModal('Nova conta',[{name:'name',label:'Nome'},{name:'type',label:'Tipo',type:'select',options:'<option>Conta corrente</option><option>Carteira</option><option>Poupança</option><option>Conta digital</option>'},{name:'institution',label:'Instituição'},{name:'initial',label:'Saldo inicial',type:'number',step:'.01',value:'0'}],data=>Core.dispatch('ADD_ACCOUNT',{...data,initial:Number(data.initial)}));return}
 if(action==='transfer'){openModal('Transferência entre contas',[{name:'fromAccountId',label:'Conta de origem',type:'select',options:accountOptions()},{name:'toAccountId',label:'Conta de destino',type:'select',options:accountOptions()},{name:'amount',label:'Valor',type:'number',min:.01,step:'.01'},{name:'date',label:'Data',type:'date',value:Core.today()},{name:'description',label:'Descrição',value:'Transferência',full:true}],data=>Core.dispatch('TRANSFER',{...data,amount:Number(data.amount)}));return}
 if(action==='settle'){const tx=state().transactions.find(x=>x.id===id);openModal(tx?.kind==='income'?'Receber lançamento':'Pagar lançamento',[{name:'accountId',label:'Conta',type:'select',options:accountOptions(tx?.accountId)},{name:'date',label:'Data da baixa',type:'date',value:Core.today()}],data=>Core.dispatch('SETTLE_TRANSACTION',{id,...data}));return}
 if(action==='delete-tx'){if(confirm('Excluir este lançamento?'))Core.dispatch('DELETE_TRANSACTION',{id});return}
 if(action==='add-card'){openModal('Novo cartão',[{name:'name',label:'Nome'},{name:'limit',label:'Limite',type:'number',min:0,step:'.01'},{name:'closingDay',label:'Dia de fechamento',type:'number',min:1,max:31},{name:'dueDay',label:'Dia de vencimento',type:'number',min:1,max:31},{name:'accountId',label:'Conta usada no pagamento',type:'select',options:accountOptions(),required:false}],data=>Core.dispatch('ADD_CARD',{...data,limit:Number(data.limit),closingDay:Number(data.closingDay),dueDay:Number(data.dueDay)}));return}
 if(action==='card-purchase'){openModal('Compra no cartão',[{name:'cardId',label:'Cartão',type:'select',options:cardOptions()},{name:'date',label:'Data',type:'date',value:Core.today()},{name:'description',label:'Descrição',full:true},{name:'category',label:'Categoria',type:'select',options:categoryOptions('Compras')},{name:'amount',label:'Valor',type:'number',min:.01,step:'.01'}],data=>Core.dispatch('ADD_CARD_PURCHASE',{...data,amount:Number(data.amount)}));return}
 if(action==='pay-card'){openModal('Pagar fatura',[{name:'accountId',label:'Conta de pagamento',type:'select',options:accountOptions(state().cards.find(c=>c.id===id)?.accountId)},{name:'date',label:'Data do pagamento',type:'date',value:Core.today()},{name:'throughDate',label:'Pagar compras até',type:'date',value:Core.today()}],data=>Core.dispatch('PAY_CARD_BILL',{cardId:id,...data}));return}
 if(action==='set-budget'){openModal('Definir orçamento',[{name:'month',label:'Mês',type:'month',value:currentMonth()},{name:'category',label:'Categoria',type:'select',options:categoryOptions()},{name:'limit',label:'Limite',type:'number',min:0,step:'.01'}],data=>Core.dispatch('SET_BUDGET',{...data,limit:Number(data.limit)}));return}
 if(action==='add-goal'){openModal('Nova meta',[{name:'name',label:'Nome',full:true},{name:'category',label:'Categoria',value:'Projeto'},{name:'target',label:'Valor-alvo',type:'number',min:0,step:'.01'},{name:'baseAmount',label:'Valor já acumulado',type:'number',min:0,step:'.01',value:'0'},{name:'deadline',label:'Prazo',type:'date',required:false}],data=>Core.dispatch('ADD_GOAL',{...data,target:Number(data.target),baseAmount:Number(data.baseAmount)}));return}
 if(action==='goal-contribution'){openModal('Aporte na meta',[{name:'accountId',label:'Retirar da conta',type:'select',options:accountOptions()},{name:'amount',label:'Valor',type:'number',min:.01,step:'.01'},{name:'date',label:'Data',type:'date',value:Core.today()}],data=>Core.dispatch('CONTRIBUTE_GOAL',{goalId:id,...data,amount:Number(data.amount)}));return}
 if(action==='add-debt'){openModal('Nova dívida',[{name:'name',label:'Nome',full:true},{name:'originalBalance',label:'Saldo devedor',type:'number',min:0,step:'.01'},{name:'interestRate',label:'Taxa de juros (%)',type:'number',min:0,step:'.01'},{name:'minimumPayment',label:'Parcela mínima',type:'number',min:0,step:'.01'},{name:'dueDay',label:'Dia de vencimento',type:'number',min:1,max:31}],data=>Core.dispatch('ADD_DEBT',{...data,originalBalance:Number(data.originalBalance),interestRate:Number(data.interestRate),minimumPayment:Number(data.minimumPayment),dueDay:Number(data.dueDay)}));return}
 if(action==='pay-debt'){openModal('Pagamento da dívida',[{name:'accountId',label:'Conta debitada',type:'select',options:accountOptions()},{name:'amount',label:'Valor pago',type:'number',min:.01,step:'.01'},{name:'date',label:'Data',type:'date',value:Core.today()}],data=>Core.dispatch('PAY_DEBT',{debtId:id,...data,amount:Number(data.amount)}));return}
 if(action==='add-investment'){openModal('Novo investimento',[{name:'name',label:'Nome',full:true},{name:'type',label:'Tipo',value:'Renda fixa'},{name:'baseAmount',label:'Valor atual',type:'number',min:0,step:'.01'},{name:'risk',label:'Risco',type:'select',options:'<option>Baixo</option><option selected>Moderado</option><option>Alto</option>'},{name:'liquidity',label:'Liquidez',value:'Diária'},{name:'emergencyReserve',label:'Considerar como reserva de emergência',type:'checkbox',required:false}],data=>Core.dispatch('ADD_INVESTMENT',{...data,baseAmount:Number(data.baseAmount)}));return}
 if(action==='investment-contribution'){openModal('Aporte no investimento',[{name:'accountId',label:'Retirar da conta',type:'select',options:accountOptions()},{name:'amount',label:'Valor',type:'number',min:.01,step:'.01'},{name:'date',label:'Data',type:'date',value:Core.today()}],data=>Core.dispatch('CONTRIBUTE_INVESTMENT',{investmentId:id,...data,amount:Number(data.amount)}));return}
 if(action==='add-asset'){openModal('Novo bem',[{name:'name',label:'Nome',full:true},{name:'type',label:'Tipo',value:'Outros'},{name:'value',label:'Valor estimado',type:'number',min:0,step:'.01'}],data=>Core.dispatch('ADD_ASSET',{...data,value:Number(data.value)}));return}
 if(action==='choose-import'){$('importFile').click();return}
 if(action==='confirm-import'){const accountId=$('importAccount').value;if(!App.importPreview.length)throw new Error('Nenhum lançamento para importar.');Core.dispatch('IMPORT_TRANSACTIONS',{accountId,items:App.importPreview});App.importPreview=[];App.importFileName='';App.setPage('dashboard');return}
 if(action==='export-csv'){exportCSV();return}
 if(action==='print'){window.print();return}
 if(action==='backup'){download('backup-minha-vida-financeira.json',Core.exportBackup(),'application/json');return}
 if(action==='restore'){$('restoreFile').click();return}
 if(action==='reset'){if(confirm('Apagar todos os dados financeiros e manter usuários?'))Core.dispatch('RESET_FINANCE');return}
}catch(error){toast(error.message||'Não foi possível concluir a ação.')}};
function splitCSVLine(line,delimiter){const out=[];let current='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){out.push(current.trim());current=''}else current+=c}out.push(current.trim());return out}
function normalizeDate(value){const s=String(value||'').trim();let m;if((m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)))return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if((m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))){let y=m[3];if(y.length===2)y='20'+y;return`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}if((m=s.match(/^(\d{4})(\d{2})(\d{2})/)))return`${m[1]}-${m[2]}-${m[3]}`;return''}
function parseAmount(value){let s=String(value??'').trim().replace(/R\$|\s/g,'');if(!s)return 0;const negative=/^-|\(|\bD\b/i.test(s);s=s.replace(/[()A-Za-z]/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Math.abs(Number(s)||0);return negative?-n:n}
function headerIndex(headers,names){const normalized=headers.map(h=>h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));for(const name of names){const index=normalized.findIndex(h=>h.includes(name));if(index>=0)return index}return-1}
function parseCSV(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());if(lines.length<2)throw new Error('CSV sem registros.');const delimiter=[';',',','\t'].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0],headers=splitCSVLine(lines[0],delimiter),di=headerIndex(headers,['data','date']),hi=headerIndex(headers,['descricao','historico','lancamento','memo','detalhe']),vi=headerIndex(headers,['valor','amount','montante']),ci=headerIndex(headers,['credito','entrada','credit']),si=headerIndex(headers,['debito','saida','debit']);if(di<0||hi<0||(vi<0&&ci<0&&si<0))throw new Error('Não foi possível identificar data, descrição e valor.');return lines.slice(1).map(line=>{const c=splitCSVLine(line,delimiter),amount=vi>=0?parseAmount(c[vi]):Math.abs(parseAmount(c[ci]))-Math.abs(parseAmount(c[si]));return{date:normalizeDate(c[di]),description:c[hi]||'Movimentação bancária',amount,category:$('importCategory')?.value||'Outros'}}).filter(item=>item.date&&item.amount!==0)}
function tag(block,name){return(block.match(new RegExp(`<${name}>([^<\\r\\n]+)`,'i'))||[])[1]?.trim()||''}
function parseOFX(text){const blocks=text.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)||[];if(!blocks.length)throw new Error('Nenhuma movimentação OFX encontrada.');return blocks.map(block=>({date:normalizeDate(tag(block,'DTPOSTED')),description:tag(block,'MEMO')||tag(block,'NAME')||'Movimentação bancária',amount:parseAmount(tag(block,'TRNAMT')),externalId:tag(block,'FITID'),category:$('importCategory')?.value||'Outros'})).filter(item=>item.date&&item.amount!==0)}
async function handleFile(file){if(!file)return;const ext=(file.name.split('.').pop()||'').toLowerCase();if(!['csv','ofx'].includes(ext)){toast('Selecione um arquivo CSV ou OFX.');return}try{const text=await file.text();App.importPreview=ext==='ofx'?parseOFX(text):parseCSV(text);App.importFileName=file.name;if(!App.importPreview.length)throw new Error('Nenhum lançamento válido encontrado.');App.renderApp();toast(`${App.importPreview.length} registro(s) lido(s).`)}catch(error){App.importPreview=[];toast(error.message)}}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportCSV(){const rows=[['Data','Descrição','Categoria','Tipo','Status','Valor','Origem']];state().transactions.filter(t=>String(t.date).startsWith(currentMonth())).forEach(t=>rows.push([t.date,t.description,t.category,t.kind,t.status,String(t.amount).replace('.',','),t.source]));download(`extrato-${currentMonth()}.csv`,'\uFEFF'+rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8')}
$('loginForm').addEventListener('submit',event=>{event.preventDefault();Core.login($('loginEmail').value,$('loginPassword').value)?App.render():$('authMessage').textContent='E-mail ou senha incorretos.'});
$('registerForm').addEventListener('submit',event=>{event.preventDefault();try{if($('registerPassword').value!==$('registerPassword2').value)throw new Error('As senhas não coincidem.');Core.register($('registerName').value,$('registerEmail').value,$('registerPassword').value);App.render()}catch(error){$('authMessage').textContent=error.message}});
$('showRegister').onclick=()=>{$('loginForm').classList.add('hidden');$('registerForm').classList.remove('hidden')};
$('showLogin').onclick=()=>{$('registerForm').classList.add('hidden');$('loginForm').classList.remove('hidden')};
$('modalCancel').onclick=closeModal;
$('modalForm').addEventListener('submit',event=>{event.preventDefault();try{const callback=App.modalSubmit;callback?.(formObject(event.target));closeModal();App.renderApp();toast(state().meta.lastEvent)}catch(error){toast(error.message)}});
$('monthFilter').addEventListener('change',App.renderApp);
document.addEventListener('click',event=>{const page=event.target.closest('[data-page]')?.dataset.page;if(page){App.setPage(page);return}const button=event.target.closest('[data-action]');if(button)App.handleAction(button.dataset.action,button.dataset.id)});
document.addEventListener('change',event=>{if(event.target.id==='importFile')handleFile(event.target.files[0]);if(event.target.dataset.importCategory!=null)App.importPreview[Number(event.target.dataset.importCategory)].category=event.target.value});
document.addEventListener('submit',event=>{if(event.target.id==='settingsForm'){event.preventDefault();const data=formObject(event.target);Core.dispatch('UPDATE_SETTINGS',{...data,emergencyMonths:Number(data.emergencyMonths)});App.render();toast('Configurações atualizadas')}});
$('restoreFile').addEventListener('change',async event=>{try{const parsed=JSON.parse(await event.target.files[0].text());Core.dispatch('RESTORE',{state:parsed});App.render();toast('Backup restaurado.')}catch(error){toast('Backup inválido.')}});
window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(App.routes[page]){App.activePage=page;App.renderApp()}});
Core.subscribe(()=>App.renderApp());
window.addEventListener('storage',event=>{if(event.key===Core.KEY)location.reload()});
App.render();
})(window.MVFApp);
