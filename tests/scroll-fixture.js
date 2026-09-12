const listeners = [], jobs = [];
window.__qyFixtureJobs = jobs;
const emit = message => listeners.forEach(fn => fn({channel:'qy-source',type:'RESULT',...message}, {id:'fixture'}, () => {}));
const publishJobs = () => document.getElementById('requests').dataset.jobs=JSON.stringify(jobs.map(j=>({kind:j.kind,status:j.status})));
const finishJob = job => { if(job?.status==='streaming'){ job.status='success'; publishJobs(); emit(job); } };
window.chrome = { runtime: { id:'fixture', onMessage:{addListener:fn=>listeners.push(fn)}, sendMessage:async message=>{
  if(message.type==='HELLO')return {ok:true,data:{enabled:true,provider:'api',language:'简体中文',buttonAllowed:true}};
  if(message.type==='TRANSLATE'){
    const values=Object.fromEntries(message.blocks.map((b,i)=>[b.id,(i===0?'已翻译的标题。':'已提前准备的中文译文。')+' '+(b.text.match(/⟪QY_KEEP_\d+⟫/gu)||[]).join(' ')]));
    const job={id:message.id,instance:message.instance,kind:message.kind||'page',status:'streaming',text:JSON.stringify(values),values};jobs.push(job);
    document.getElementById('requests').textContent=`请求数：${jobs.length}`;
    publishJobs();
    document.getElementById('requests').dataset.lastInput=JSON.stringify(message.blocks);
    setTimeout(()=>{if(job.status==='streaming')emit({...job,text:job.text.slice(0,job.text.indexOf('。')+1)});},100);
    if(new URLSearchParams(location.search).has('auto'))setTimeout(()=>finishJob(job),job.kind==='prefetch'?350:150);
    return {ok:true,data:{id:job.id,status:'waiting'}};
  }
  if(message.type==='CANCEL'){const job=jobs.find(j=>j.id===message.id);if(job){job.status='cancelled';publishJobs();emit(job);}return {ok:true,data:{}};}
  return {ok:true,data:{}};
}}};
document.getElementById('start').onclick=()=>listeners.forEach(fn=>fn({channel:'qy-source',type:'PAGE'},{id:'fixture'},()=>{}));
document.getElementById('finish').onclick=()=>finishJob(jobs.find(j=>j.status==='streaming'));
document.getElementById('next').onclick=()=>{
  window.__qyScrollStarted=performance.now();
  document.documentElement.dataset.qyScrollStarted=String(window.__qyScrollStarted);
  document.getElementById('screen-two').scrollIntoView();
  const watch=setInterval(()=>{
    if(document.querySelector('#second qy-translation')?.shadowRoot?.textContent){
      document.documentElement.dataset.qyScrollTranslationMs=String(Math.round(performance.now()-window.__qyScrollStarted));
      clearInterval(watch);
    }
  },5);
};
document.getElementById('back').onclick=()=>document.getElementById('screen-one').scrollIntoView();
