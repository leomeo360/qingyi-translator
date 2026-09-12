const listeners = [];
let count = 0;
let activeId;
let previous;
const jobs = new Map();
const preferences = { enabled: true, provider: 'api', language: '简体中文', buttonAllowed: true, showSource: false, selectionButton: true };
const emit = message => listeners.forEach(fn => fn({channel:'qy-source',type:'RESULT',...message}, {id:'fixture'}, () => {}));
window.chrome = { runtime: { id: 'fixture', onMessage: { addListener: fn => listeners.push(fn) }, sendMessage: async message => {
  if (message.type === 'HELLO') return {ok:true,data:preferences};
  if (message.type === 'TRANSLATE') {
    count++; document.getElementById('count').textContent=`已提交 ${count} 个模拟任务`;
    previous = activeId && jobs.get(activeId); activeId=message.id;
    const job={id:message.id,instance:message.instance,language:'简体中文',status:'waiting',text:''}; jobs.set(job.id,job);
    const fragments=message.blocks ? [JSON.stringify(Object.fromEntries(message.blocks.map(b=>[b.id,'译文：'+b.text])))] : ['一点好奇心','一点好奇心，能带你','一点好奇心，能带你走得很远。'];
    fragments.forEach((text,i)=>setTimeout(()=>{if(job.status==='cancelled')return; Object.assign(job,{status:i===fragments.length-1?'success':'streaming',text});emit(job);},(i+1)*600));
    return {ok:true,data:{id:job.id,status:'waiting',language:'简体中文'}};
  }
  if(message.type==='CANCEL'){const job=jobs.get(message.id);if(job){job.status='cancelled';emit(job);}return {ok:true,data:{}};}
  return {ok:true,data:{}};
} } };
document.getElementById('select').onclick=()=>{const range=document.createRange();range.selectNodeContents(document.getElementById('sample'));getSelection().removeAllRanges();getSelection().addRange(range);};
document.getElementById('late').onclick=()=>{if(previous)emit({...previous,status:'success',text:'错误：这是旧任务，不应覆盖当前译文'});};

const pageButton=document.createElement('button');pageButton.textContent='模拟整页翻译';pageButton.onclick=()=>listeners.forEach(fn=>fn({channel:'qy-source',type:'PAGE'},{id:'fixture'},()=>{}));document.body.prepend(pageButton);
