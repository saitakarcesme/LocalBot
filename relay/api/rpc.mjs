import {getCache} from '@vercel/functions';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
 try {
  const value=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!value || !/^[A-Za-z0-9_-]{43}$/.test(value.host) || typeof value.box!=='string' || value.box.length>3500000 || !/^Bearer [A-Za-z0-9_-]{32,100}$/.test(req.headers.authorization??'')){res.status(400).json({error:'Invalid envelope'});return;}
  const route=await getCache({namespace:'localbot-connect-routes-v1'}).get(value.host);
  if(!route || route.expires<Date.now()){res.status(503).json({error:'Host offline. Open LocalBot and enable Remote.'});return;}
  const response=await fetch(route.url+'/rpc',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:req.headers.authorization},body:JSON.stringify(value),signal:AbortSignal.timeout(110000)});
  const chunks=[];let size=0;
  if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>4000000)throw Error('Response limit');chunks.push(chunk);}
  res.status(response.status).setHeader('Content-Type','application/json');res.end(Buffer.concat(chunks));
 }catch{res.status(502).json({error:'Host unavailable. Retry after checking its connection.'});}
}
