export default async({page,api,expect,model,shot})=>{
 const state=await api('state'),a=state.bots[0].id;
 const {id:b}=await api('bots',{name:'Parallel bot',personality:'Help',color:'#7fd8b0'});
 const one=await api('send',{bot:a,prompt:'slow first'}),two=await api('send',{bot:b,prompt:'slow second'});
 let snapshot;
 for(let i=0;i<60;i++){snapshot=await api('state');if(snapshot.streaming.length===2&&snapshot.streaming.every(x=>x.content))break;await page.waitForTimeout(100);}
 expect(snapshot.runs.filter(x=>[one.id,two.id].includes(x.id)&&x.status==='running').length===2,'both bots running');
 expect(snapshot.streaming.length===2,'two separate token streams');
 await api('cancel',{id:one.id});await page.waitForTimeout(150);
 snapshot=await api('state');expect(snapshot.runs.find(x=>x.id===two.id).status==='running','second survives cancel');
 expect(model.requests.length===2,'both model requests started');await shot('running');
 await api('cancel',{id:two.id});
};
