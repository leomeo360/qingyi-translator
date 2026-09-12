const events=[],jobs=[];
const trigger=(type,extra={})=>events.forEach(fn=>fn({channel:'qy-source',type,...extra},{id:'startup-fixture'},()=>{}));
const emit=job=>trigger('RESULT',job);
let began;
window.chrome={runtime:{id:'startup-fixture',onMessage:{addListener:fn=>events.push(fn)},sendMessage:async message=>{
  if(message.type==='HELLO')return {ok:true,data:{enabled:true,provider:'api',language:'简体中文',customTerms:[],buttonAllowed:true}};
  if(message.type==='TRANSLATE'){
    const job={id:message.id,instance:message.instance,status:'waiting',text:JSON.stringify(Object.fromEntries(message.blocks.map(b=>[b.id,'已翻译的段落 '+b.id+' '+(b.text.match(/⟪QY_KEEP_\d+⟫/gu)||[]).join(' ')])))};
    jobs.push(job);document.querySelector('#status').textContent=`请求数：${jobs.length}`;
    const capture=document.querySelector('#capture');capture.dataset.inputs=JSON.stringify(message.blocks);
    if(jobs.length===1){capture.dataset.firstSendMs=String(performance.now()-began);capture.dataset.firstIndexed=document.querySelector('[data-qy-root]').dataset.pageIndexedNodes;capture.dataset.firstScanSlices=document.querySelector('[data-qy-root]').dataset.pageScanSlices;}
    return {ok:true,data:{id:job.id,status:'waiting'}};
  }
  if(message.type==='CANCEL'){const job=jobs.find(x=>x.id===message.id);if(job){job.status='cancelled';emit(job);}return {ok:true,data:{}};}
  return {ok:true,data:{}};
}}};
const offscreen=document.querySelector('#offscreen'), fragment=document.createDocumentFragment();
for(let i=0;i<1800;i++){const p=document.createElement('p');p.textContent=`Offscreen paragraph number ${i} is not requested until it becomes visible.`;fragment.append(p);}offscreen.append(fragment);
document.querySelector('#start').onclick=()=>{began=performance.now();trigger('PAGE');};
document.querySelector('#finish').onclick=()=>{const job=jobs.find(x=>x.status==='waiting');if(job){job.status='success';emit(job);}};
document.querySelector('#fail').onclick=()=>{const job=jobs.find(x=>x.status==='waiting');if(job){job.status='error';job.message='模拟连接中断';emit(job);}};
document.querySelector('#mutate').onclick=()=>document.querySelector('#changing').replaceChildren(document.createTextNode('Updated source after a page redraw.'));
document.querySelector('#theme').onclick=()=>document.body.classList.toggle('theme');
document.querySelector('#reset').onclick=()=>trigger('CLEAR');
