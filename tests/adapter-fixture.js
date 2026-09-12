const handlers=[];
const events=[];
let submits=0;
let currentKey=2;
const textarea=document.querySelector('textarea');
const sendButton=document.getElementById('send');
window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>handlers.push(fn)},sendMessage:async event=>{events.push(event);}}};
textarea.addEventListener('input',()=>sendButton.classList.toggle('ds-button--disabled',!textarea.value));
sendButton.onclick=()=>{
  submits++;
  currentKey+=2;
  const key=currentKey;
  const user=document.createElement('div'); user.dataset.virtualListItemKey=String(-key);
  const text=document.createElement('div');text.className='ds-message';text.textContent=textarea.value;user.append(text);document.getElementById('messages').append(user);
  textarea.value='';sendButton.classList.add('ds-button--disabled');
  const answer=document.createElement('div');answer.dataset.virtualListItemKey=String(key);
  const thought=document.createElement('div');thought.textContent='这是思考内容，不是译文';answer.append(thought);
  const body=document.createElement('div');body.className='ds-assistant-message-main-content';answer.append(body);document.getElementById('messages').append(answer);
  setTimeout(()=>{body.textContent='你好';},100);
  setTimeout(()=>{body.textContent='你好，世界！';const control=document.createElement('div');control.setAttribute('role','button');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M7.92136 0.349152');svg.append(path);control.append(svg);answer.append(control);},300);
};
const call=(type,extra={})=>new Promise(resolve=>handlers[0]({channel:'qy-adapter',type,...extra},{id:'fixture'},resolve));
document.getElementById('run-checks').onclick=async()=>{
  const results=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);results.push(`PASS ${label}`);document.getElementById('results').textContent=results.join('\n');};
  try{
    const status=await call('STATUS');check(status.ready,'空白输入框被识别为就绪');
    textarea.value='用户的草稿';check(!(await call('STATUS')).ready,'草稿阻止发送');textarea.value='';
    const job={id:crypto.randomUUID(),prompt:'请翻译：Hello, world!',pageId:status.pageId,session:location.pathname,guard:status.guard,mode:status.mode,deadline:Date.now()+30000};
    check((await call('RUN',{job})).ok,'本轮只点击发送一次');
    await new Promise(resolve=>setTimeout(resolve,800));
    const end=await call('STATUS');check(end.job?.status==='success','明确结束控件确认完成');
    check(end.job.text==='你好，世界！','只提取本轮正文，不混入历史与思考');
    await call('RUN',{job});check(submits===1,'同一任务编号不会重复发送');
    const cancellation={...job,id:crypto.randomUUID(),prompt:'请翻译：Good morning!',deadline:Date.now()+30000};
    await call('RUN',{job:cancellation});
    const cancelled=await call('CANCEL',{id:cancellation.id});
    check(!cancelled.ready,'取消后，未确认本轮结束前不会释放远端会话');
    await new Promise(resolve=>setTimeout(resolve,800));
    check((await call('STATUS')).ready,'本轮明确结束后允许用户重新确认连接');
    document.getElementById('results').textContent+='\n全部通过';
  }catch(error){document.getElementById('results').textContent+=`\nFAIL ${error.message}`;}
};
