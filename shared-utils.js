(function (App) {
'use strict';
if (!App) return;

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

App.normalizeDate = normalizeDate;
App.parseAmount = parseAmount;
App.splitCSVLine = splitCSVLine;

})(window.MVFApp);
