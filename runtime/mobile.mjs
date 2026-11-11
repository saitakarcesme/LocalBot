import {createServer} from 'node:http';
import {timingSafeEqual, createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';

export function phonePairingCode(token, now=Date.now()) {
 const digest=createHmac('sha256',token).update('phone-code:'+Math.floor(now/600000)).digest();
 return String(digest.readUInt32BE(0)%100000000).padStart(8,'0');
}

// An opt-in loopback listener behind Tailscale Serve. The mobile credential lives
// outside version-reset data so an installed phone stays paired after updates.
export function mobileHandler({origin,token}, desktopToken, handler, port) {
 const installKey=createHmac('sha256',token).update('localbot-home-screen-v1').digest('hex');
 const matches=(a,b)=>{a=Buffer.from(a||'');b=Buffer.from(b);return a.length===b.length&&timingSafeEqual(a,b);};
 const reply=(res,value)=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));};
 const equal=value=>{const a=Buffer.from(value||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&timingSafeEqual(a,b);};
 let failures=0,windowStart=Date.now();
 return async (req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const deny=status=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:status===401?'Unauthorized':'Origin denied'}));};
  if(req.headers.origin && req.headers.origin!==origin)return deny(403);
  res.setHeader('Referrer-Policy','no-referrer');
  if(path==='/api/mobile-pair-code' && req.method==='POST'){
   if(Date.now()-windowStart>=600000){windowStart=Date.now();failures=0;}
   if(failures>=5){res.writeHead(429,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Too many attempts. Try again in 10 minutes.'}));return;}
   failures++;
   let raw='';
   try{for await(const chunk of req){raw+=chunk;if(raw.length>256)return deny(401);}
    const code=JSON.parse(raw).code;
    if(typeof code!=='string'||!/^\d{8}$/.test(code)||!matches(code,phonePairingCode(token)))return deny(401);
   }catch{return deny(401);}
   failures=0;return reply(res,{token});
  }
  if(path==='/api/mobile-pair' && req.method==='GET'){
   if(!matches(req.headers.authorization,'Bearer '+installKey))return deny(401);
   return reply(res,{token});
  }
  if(path.startsWith('/mobile-manifest/')){
   if(req.method!=='GET'||!matches(path,'/mobile-manifest/'+installKey+'.webmanifest'))return deny(401);
   return reply(res,{id:'/',name:'LocalBot',short_name:'LocalBot',start_url:'/launch/'+installKey,scope:'/',display:'standalone',background_color:'#141414',theme_color:'#141414',icons:[{src:'/assets/mobile-icon.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]});
  }
  if(path.startsWith('/launch/')){
   if(req.method!=='GET'||!matches(path,'/launch/'+installKey))return deny(401);
   req.url='/';
  }
  if(path.startsWith('/api/')){
   if(!equal(req.headers.authorization))return deny(401);
   if(path==='/api/mobile-install' && req.method==='GET')return reply(res,{manifest:'/mobile-manifest/'+installKey+'.webmanifest'});
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
