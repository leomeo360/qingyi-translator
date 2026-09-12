const listeners=[];
const sent=document.getElementById('sent');
window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async message=>{
  if(message.type==='HELLO')return {ok:true,data:{enabled:true,provider:'api',language:'简体中文',buttonAllowed:true,prefetchScreens:0,siteModes:{}}};
  if(message.type==='TRANSLATE'){
    sent.dataset.blocks=JSON.stringify(message.blocks.map(block=>block.text));
    sent.textContent=`已发送 ${message.blocks.length} 段`;
    const values=Object.fromEntries(message.blocks.map(block=>[block.id,`译：${block.text}`]));
    setTimeout(()=>listeners.forEach(fn=>fn({channel:'qy-source',type:'RESULT',id:message.id,instance:message.instance,status:'success',text:JSON.stringify(values)},{id:'fixture'},()=>{})),20);
    return {ok:true,data:{id:message.id,status:'waiting'}};
  }
  return {ok:true,data:{}};
}}};
let clicks=0;
document.getElementById('action').addEventListener('click',()=>{document.getElementById('clicks').textContent=`点击：${++clicks}`;});
setTimeout(()=>listeners.forEach(fn=>fn({channel:'qy-source',type:'PAGE',scope:'all'},{id:'fixture'},()=>{})),0);
