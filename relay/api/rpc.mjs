import {forwardTunnel} from '../upstream.mjs';
import {getCache} from '@vercel/functions';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
 try {
  const value=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!value || !/^[A-Za-z0-9_-]{43}$/.test(value.host) || typeof value.box!=='string' || value.box.length>3500000 || !/^Bearer [A-Za-z0-9_-]{32,100}$/.test(req.headers.authorization??'')){res.status(400).json({error:'Invalid envelope'});return;}
  const route=await getCache({namespace:'localbot-connect-routes-v1'}).get(value.host);
  if(!route || route.expires<Date.now()){res.status(503).json({error:'Host offline. Open LocalBot and enable Remote.'});return;}
  const response=await forwardTunnel(route.url+'/rpc',req.headers.authorization,JSON.stringify(value));
  res.status(response.status).setHeader('Content-Type','application/json');res.end(response.body);
 }catch(error){console.error('Relay upstream failure',error?.name,error?.cause?.code??error?.code??'unknown');res.status(502).json({error:'Host unavailable. Retry after checking its connection.'});}
}
