(function (App) {
'use strict';
if (!App || !App.Core) return;

const RULES_KEY='mvf_import_rules_v1';
const normalize=value=>String(value==null?'':value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const uid=(prefix='id')=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
const readRules=()=>{try{const data=JSON.parse(localStorage.getItem(RULES_KEY)||'{}');return{salaryPayers:Array.isArray(data.salaryPayers)?data.salaryPayers:[]}}catch(error){return{salaryPayers:[]}}};
const saveRules=rules=>localStorage.setItem(RULES_KEY,JSON.stringify(rules));

function normalizeDate(value){
 const text=String(value||'').trim();let match;
 if((match=text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)))return`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
 if((match=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))){const year=match[3].length===2?`20${match[3]}`:match[3];return`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`}
 if((match=text.match(/^(\d{4})(\d{2})(\d{2})/)))return`${match[1]}-${match[2]}-${match[3]}`;
 return'';
}

function parseAmount(value){
 let text=String(value==null?'':value).trim().replace(/R\$|\s/g,'');if(!text)return 0;
 const negative=/^-|\(|\bD\b/i.test(text);text=text.replace(/[()A-Za-z]/g,'');
 if(text.includes(',')&&text.includes('.'))text=text.lastIndexOf(',')>text.lastIndexOf('.')?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'');
 else if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');
 const amount=Math.abs(Number(text)||0);return negative?-amount:amount;
}

function splitCSVLine(line,delimiter){
 const output=[];let current='',quoted=false;
 for(let index=0;index<line.length;index+=1){const char=line[index];if(char==='"'){if(quoted&&line[index+1]==='"'){current+='"';index+=1}else quoted=!quoted}else if(char===delimiter&&!quoted){output.push(current.trim());current=''}else current+=char}
 output.push(current.trim());return output;
}

function headerIndex(headers,names){const normalized=headers.map(normalize);for(const name of names){const index=normalized.findIndex(header=>header.includes(name));if(index>=0)return index}return-1}
function ofxTag(block,name){return(block.match(new RegExp(`<${name}>([^<\\r\\n]+)`,'i'))||[])[1]?.trim()||''}

function detectMethod(description,bankType=''){
 const value=normalize(`${description} ${bankType}`);
 if(/\bpix\b/.test(value))return'pix';
 if(/\bted\b/.test(value))return'ted';
 if(/\bdoc\b/.test(value))return'doc';
 if(/transfer|transf|credito em conta|debito em conta|ordem bancaria|pagamento de salario/.test(value))return'bank_transfer';
 return'other';
}

function cleanCounterparty(description,name=''){
 if(String(name||'').trim())return String(name).trim();
 let value=String(description||'').replace(/pix|recebido|enviado|transfer[eê]ncia|transf|ted|doc|cr[eé]dito|d[eé]bito|via banco|ag\.?\s*\d+|cc\.?\s*\d+/gi,' ').replace(/\s+/g,' ').trim();
 return value.slice(0,120)||'Não identificado';
}

function classificationFor(amount,method){
 const received=Number(amount)>=0;
 const labels={pix:received?'PIX recebido':'PIX enviado',ted:received?'TED recebida':'TED enviada',doc:received?'DOC recebido':'DOC enviado',bank_transfer:received?'Transferência bancária recebida':'Transferência bancária enviada',other:received?'Outra entrada':'Outra saída'};
 return{direction:received?'received':'sent',method,label:labels[method]};
}

function applySalaryRule(item,accountId){
 const haystack=normalize(`${item.description} ${item.counterparty}`);
 const rule=readRules().salaryPayers.find(candidate=>(!candidate.accountId||candidate.accountId===accountId)&&candidate.matchText&&haystack.includes(normalize(candidate.matchText)));
 if(rule&&item.amount>0){item.isSalary=true;item.salaryPayer=rule.payerName;item.category='Salário';item.counterparty=rule.payerName;item.classification='Salário recebido';item.recurringType='salary';return rule}
 return null;
}

function decorate(item,accountId=''){
 const detected=classificationFor(item.amount,detectMethod(item.description,item.bankType));
 item.localId=item.localId||uid('row');item.selected=item.selected!==false;item.method=item.method||detected.method;item.direction=item.direction||detected.direction;item.classification=item.classification||detected.label;item.counterparty=item.counterparty||cleanCounterparty(item.description,item.bankName);item.category=item.category||(item.amount>=0?'Renda extra':'Outros');applySalaryRule(item,accountId);return item;
}

function parseCSV(text,fileName,accountId=''){
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());if(lines.length<2)throw new Error('CSV sem registros.');
 const delimiter=[';',',','\t'].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0];const headers=splitCSVLine(lines[0],delimiter);
 const dateIndex=headerIndex(headers,['data','date']);const descriptionIndex=headerIndex(headers,['descricao','historico','lancamento','memo','detalhe','nome']);const valueIndex=headerIndex(headers,['valor','amount','montante']);const creditIndex=headerIndex(headers,['credito','entrada','credit']);const debitIndex=headerIndex(headers,['debito','saida','debit']);const idIndex=headerIndex(headers,['fitid','identificador','documento','id']);const nameIndex=headerIndex(headers,['favorecido','pagador','beneficiario','contraparte','nome']);
 if(dateIndex<0||descriptionIndex<0||(valueIndex<0&&creditIndex<0&&debitIndex<0))throw new Error('Não foi possível identificar data, descrição e valor.');
 return lines.slice(1).map((line,rowIndex)=>{const columns=splitCSVLine(line,delimiter);const amount=valueIndex>=0?parseAmount(columns[valueIndex]):Math.abs(parseAmount(columns[creditIndex]))-Math.abs(parseAmount(columns[debitIndex]));return decorate({date:normalizeDate(columns[dateIndex]),description:columns[descriptionIndex]||'Movimentação bancária',amount,externalId:idIndex>=0?String(columns[idIndex]||'').trim():'',bankName:nameIndex>=0?columns[nameIndex]:'',sourceFile:fileName,sourceRow:rowIndex+2},accountId)}).filter(item=>item.date&&item.amount!==0);
}

function parseOFX(text,fileName,accountId=''){
 const blocks=text.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)||[];if(!blocks.length)throw new Error('Nenhuma movimentação OFX encontrada.');
 return blocks.map((block,rowIndex)=>decorate({date:normalizeDate(ofxTag(block,'DTPOSTED')),description:ofxTag(block,'MEMO')||ofxTag(block,'NAME')||'Movimentação bancária',amount:parseAmount(ofxTag(block,'TRNAMT')),externalId:ofxTag(block,'FITID'),bankType:ofxTag(block,'TRNTYPE'),bankName:ofxTag(block,'NAME'),sourceFile:fileName,sourceRow:rowIndex+1},accountId)).filter(item=>item.date&&item.amount!==0);
}

function itemKey(item,accountId){const external=String(item.externalId||'').trim();if(external)return`${accountId}|id|${external}`;return`${accountId}|sig|${item.date}|${normalize(item.description)}|${Math.round(Number(item.amount||0)*100)}`}
function transactionKey(transaction){const accountId=String(transaction.accountId||'');const external=String(transaction.externalId||transaction.importId||'').trim();const signed=(transaction.kind==='income'?1:-1)*Math.abs(Number(transaction.amount||0));if(external)return`${accountId}|id|${external}`;return`${accountId}|sig|${String(transaction.date||'').slice(0,10)}|${normalize(transaction.description)}|${Math.round(signed*100)}`}

let _cachedTransactions=null;let _cachedExisting=null;
function refreshDuplicates(batches){
 const currentTransactions=App.state().transactions;
 if(_cachedTransactions!==currentTransactions){
  _cachedExisting=new Set(currentTransactions.map(transactionKey));
  _cachedTransactions=currentTransactions;
 }
 const existing=_cachedExisting;const seen=new Set();
 batches.forEach(batch=>batch.items.forEach(item=>{applySalaryRule(item,batch.accountId);const key=itemKey(item,batch.accountId);item.duplicateExisting=existing.has(key);item.duplicateBatch=seen.has(key);if(!item.duplicateExisting&&!item.duplicateBatch)seen.add(key)}));
}

function addSalaryRule(payerName,matchText,accountId=''){
 const name=String(payerName||'').trim();const match=String(matchText||'').trim();if(!name)throw new Error('Informe quem paga o salário.');if(!match)throw new Error('Informe o texto que aparece no extrato.');
 const rules=readRules();const normalized=normalize(match);const existing=rules.salaryPayers.find(rule=>normalize(rule.matchText)===normalized&&String(rule.accountId||'')===String(accountId||''));
 if(existing){existing.payerName=name;existing.matchText=match}else rules.salaryPayers.push({id:uid('salary'),payerName:name,matchText:match,accountId:String(accountId||''),createdAt:new Date().toISOString()});saveRules(rules);return rules;
}
function removeSalaryRule(id){const rules=readRules();rules.salaryPayers=rules.salaryPayers.filter(rule=>rule.id!==id);saveRules(rules);return rules}

function persistMetadata(itemsByAccount){
 const database=App.Core.getState();const transactions=database.transactions;
 itemsByAccount.forEach(({accountId,items})=>items.forEach(item=>{const match=transactions.find(transaction=>transaction.accountId===accountId&&(!transaction._importMetadataApplied)&&((item.externalId&&transaction.externalId===item.externalId)||(String(transaction.date).slice(0,10)===item.date&&normalize(transaction.description)===normalize(item.description)&&Math.abs(Number(transaction.amount||0))===Math.abs(Number(item.amount||0)))));if(!match)return;match.transferMethod=item.method;match.transferDirection=item.direction;match.transferClassification=item.classification;match.counterparty=item.counterparty;match.salaryPayer=item.salaryPayer||'';match.recurringType=item.recurringType||'';match.sourceFile=item.sourceFile||'';match._importMetadataApplied=true}));
 transactions.forEach(transaction=>{if(transaction._importMetadataApplied)delete transaction._importMetadataApplied});database.meta=database.meta||{};database.meta.revision=Number(database.meta.revision||0)+1;database.meta.updatedAt=new Date().toISOString();database.meta.lastEvent='Extratos classificados e integrados';localStorage.setItem(App.Core.KEY,JSON.stringify(database));window.dispatchEvent(new CustomEvent('mvf:changed',{detail:{event:database.meta.lastEvent,revision:database.meta.revision}}));
}

App.BatchImport={RULES_KEY,normalize,readRules,saveRules,addSalaryRule,removeSalaryRule,parseCSV,parseOFX,decorate,applySalaryRule,refreshDuplicates,itemKey,transactionKey,persistMetadata};
})(window.MVFApp);