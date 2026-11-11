import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';

// An opt-in loopback listener behind Tailscale Serve. The mobile credential lives
// outside version-reset data so an installed phone stays paired after updates.
export function mobileHandler({origin,token}, desktopToken, handler, port) {
 const equal=value=>{const a=Buffer.from(value||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&timingSafeEqual(a,b);};
 return (req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const deny=status=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:status===401?'Unauthorized':'Origin denied'}));};
  if(req.headers.origin && req.headers.origin!==origin)return deny(403);
  if(path.startsWith('/api/')){
   if(!equal(req.headers.authorization))return deny(401);
   // Native host polling/results are exclusively for the Mac bridge.
   if(path.startsWith('/api/native'))return deny(403);
   req.headers.authorization='Bearer '+desktopToken;
  }
  if(req.headers.origin)req.headers.origin='http://127.0.0.1:'+port;
  handler(req,res);
 };
}
export async function startMobile(root,desktopToken,handler,port) {
 let config;
 try{config=JSON.parse(await readFile(join(dirname(root),'mobile.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const url=new URL(config.origin);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.ts.net')||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!/^[a-f0-9]{64}$/.test(config.token))throw Error('Invalid mobile configuration');
 const server=createServer(mobileHandler(config,desktopToken,handler,port));
 await new Promise((ok,no)=>{server.once('error',no);server.listen(18471,'127.0.0.1',ok);});
 return server;
}
