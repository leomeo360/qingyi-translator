const preferences={enabled:true,provider:'web',language:'简体中文',selectionButton:true,showSource:false,timeout:60,cache:true,disabledSites:[]};
const origins=[];
window.chrome={
  runtime:{sendMessage:async message=>({ok:true,data:message.type==='GET_PANEL'?{settings:preferences,binding:null,status:null,current:{id:1,origin:'https://example.com',supported:true},shortcut:'Alt+Shift+T',permissions:{origins}}:message.type==='SET_SETTINGS'?Object.assign(preferences,message.patch):message.type==='LIST_CHAT'?[]:{}})},
  permissions:{contains:async()=>false,getAll:async()=>({origins}),request:async()=>true,remove:async()=>true},
  scripting:{executeScript:async()=>[]}
};
