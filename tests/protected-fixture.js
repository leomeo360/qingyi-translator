const listeners=[],jobs=[],inputs=[];
const emit=message=>listeners.forEach(fn=>fn({channel:'qy-source',type:'RESULT',...message},{id:'fixture'},()=>{}));
window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async message=>{
 if(message.type==='HELLO')return {ok:true,data:{enabled:true,provider:'api',language:'简体中文',buttonAllowed:true,customTerms:['Acme+']}};
 if(message.type==='TRANSLATE'){
  inputs.push(...message.blocks);document.getElementById('input').dataset.sent=JSON.stringify(inputs);
  const dictionary={'Documentation':'文档','and':'和','to build apps.':'构建应用。','Use':'使用','to view your account.':'查看你的账号。','Call':'调用','to display the result.':'显示结果。','Before hello world after.':'之前你好世界之后。','hello world':'你好，世界'};
  const text=JSON.stringify(Object.fromEntries(message.blocks.map(b=>[b.id,dictionary[b.text]||('中文译文 '+(b.text.match(/⟪QY_KEEP_\d+⟫/gu)||[]).join(' '))])));
  const job={id:message.id,instance:message.instance,status:'streaming',text};jobs.push(job);document.getElementById('requests').textContent=`请求数：${jobs.length}`;
  setTimeout(()=>{if(job.status==='streaming')emit({...job,text:text.slice(0,Math.max(8,text.indexOf(',')>0?text.indexOf(','):text.length-2))});},100);
  return {ok:true,data:{id:job.id,status:'waiting'}};
 }
 if(message.type==='CANCEL'){const job=jobs.find(j=>j.id===message.id);if(job){job.status='cancelled';emit(job);}return {ok:true,data:{}};}
 return {ok:true,data:{}};
}}};
const trigger=type=>listeners.forEach(fn=>fn({channel:'qy-source',type},{id:'fixture'},()=>{}));
document.getElementById('page').onclick=()=>trigger('PAGE');
document.getElementById('finish').onclick=()=>{const job=jobs.find(j=>j.status==='streaming');if(job){job.status='success';emit(job);}};
document.getElementById('reset').onclick=()=>trigger('CLEAR');
document.getElementById('selection').onclick=()=>trigger('TRIGGER');
document.getElementById('select').onclick=()=>{const node=document.getElementById('partial').firstChild,range=document.createRange();range.setStart(node,7);range.setEnd(node,18);getSelection().removeAllRanges();getSelection().addRange(range);};

document.getElementById('append').onclick=()=>{const p=document.createElement('p');p.id='dynamic-copy';p.textContent='A newly added paragraph.';document.querySelector('h1').after(p);};

document.getElementById('all-content').onclick=()=>{listeners.forEach(fn=>fn({channel:'qy-source',type:'SETTINGS',settings:{enabled:true,provider:'api',language:'简体中文',buttonAllowed:true,customTerms:['Acme+'],siteModes:{[location.origin]:'all'}}},{id:'fixture'},()=>{}));trigger('PAGE');};
