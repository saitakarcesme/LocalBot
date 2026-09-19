import {getCache} from '@vercel/functions';
import {validateRegistration} from '../identity.mjs';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
 try {
  const raw=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(JSON.stringify(raw).length>2000)throw Error('Registration too large');
  const route=validateRegistration(raw);
  await getCache({namespace:'localbot-connect-routes-v1'}).set(route.host,route,{ttl:300});
  res.status(200).json({ok:true});
 }catch{res.status(400).json({error:'Invalid signed host registration'});}
}
