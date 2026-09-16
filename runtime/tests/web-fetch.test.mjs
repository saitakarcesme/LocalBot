import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {fetchPage,publicIP} from '../dist/web-fetch.js';

async function fixture(fn) {
 const seen=[];const server=createServer((req,res)=>{
  const path=req.url;
  if(path==='/start'){res.writeHead(302,{Location:'/text'});res.end();}
  else if(path==='/private'){res.writeHead(307,{Location:'https://internal.example/secret'});res.end();}
  else if(path==='/downgrade'){res.writeHead(301,{Location:'http://public.example/text'});res.end();}
  else if(path==='/loop'){res.writeHead(308,{Location:'/loop'});res.end();}
  else if(path.startsWith('/hop/')){res.writeHead(302,{Location:'/hop/'+(Number(path.split('/').at(-1))+1)});res.end();}
  else if(path==='/binary'){res.writeHead(200,{'Content-Type':'image/png'});res.end('binary');}
  else if(path==='/large'){res.end('a'.repeat(500001));}
  else if(path==='/slow'){res.writeHead(200);res.write('waiting');}
  else {res.setHeader('Content-Type','text/plain; charset=utf-8');const bytes=Buffer.from('İş tamamlandı: 1 < 2\nnext line');res.write(bytes.subarray(0,1));setImmediate(()=>res.end(bytes.subarray(1)));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const dependencies={lookup:async(host)=>[{address:host==='internal.example'?'127.0.0.1':'93.184.215.14',family:4}],request:(url,options,callback)=>{
  seen.push(url.href);options.lookup(url.hostname,{all:true},(_,ips)=>assert.equal(ips[0].address,'93.184.215.14'));
  assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
  return request({hostname:'127.0.0.1',port:server.address().port,path:url.pathname,signal:options.signal,headers:options.headers},callback);
 }};
 try{await fn(dependencies,seen);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('web redirects revalidate destinations and preserve split UTF-8/plain text',()=>fixture(async(d,seen)=>{
 const result=await fetchPage('https://public.example/start',new AbortController().signal,d);
 assert.equal(result,'Source: https://public.example/text\nİş tamamlandı: 1 < 2\nnext line');assert.equal(seen.length,2);
}));
test('web redirect boundaries stop private destinations, downgrade, loops and long chains',()=>fixture(async(d,seen)=>{
 for(const [path,error] of [['private',/Private-network/],['downgrade',/public HTTPS/],['loop',/loop/],['hop/0',/limit exceeded/]]) await assert.rejects(fetchPage('https://public.example/'+path,new AbortController().signal,d),error);
 assert(!seen.some(x=>x.includes('internal.example')));
}));
test('web responses enforce type/byte bounds and cancellation',()=>fixture(async(d)=>{
 for(const [path,error] of [['binary',/not text/],['large',/500 KB/]])await assert.rejects(fetchPage('https://public.example/'+path,new AbortController().signal,d),error);
 const c=new AbortController();const pending=fetchPage('https://public.example/slow',c.signal,d);setTimeout(()=>c.abort(),30);await assert.rejects(pending,/abort/i);
 const pendingDNS=new AbortController();const dns=fetchPage('https://public.example/',pendingDNS.signal,{...d,lookup:()=>new Promise(()=>{})});pendingDNS.abort();await assert.rejects(dns,/abort/i);
}));
test('public IP policy excludes special-use and transition addresses',()=>{
 for(const ip of ['192.0.2.1','198.51.100.1','203.0.113.1','100.64.0.1','::ffff:127.0.0.1','64:ff9b::a00:1','2002:7f00:1::','2001:0:1234::1','2001:db8::1','3fff::1','fc00::1','fe80::1'])assert.equal(publicIP(ip),false,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicIP(ip),true,ip);
});
