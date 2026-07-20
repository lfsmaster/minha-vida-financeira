(function(App){
'use strict';
if(!App)return;
function protectLegacyCategory(event){if(event.target&&event.target.dataset&&event.target.dataset.importCategory!=null){App.importPreview=Array.isArray(App.importPreview)?App.importPreview:[];App.importPreview.NaN=App.importPreview.NaN||{category:''}}}
document.addEventListener('change',protectLegacyCategory,true);
document.addEventListener('dragover',event=>{if(event.target.closest&&event.target.closest('#dropZone')){event.preventDefault();event.dataTransfer.dropEffect='copy'}},true);
document.addEventListener('drop',event=>{const zone=event.target.closest&&event.target.closest('#dropZone');if(!zone)return;event.preventDefault();const input=document.getElementById('importFiles');if(!input||!event.dataTransfer?.files?.length)return;try{input.files=event.dataTransfer.files}catch(error){}input.dispatchEvent(new Event('change',{bubbles:true}))},true);
})(window.MVFApp);