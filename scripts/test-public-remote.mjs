import {RoutingPublisher} from '../runtime/dist/remote/routing.js';
import {RemoteGateway} from '../runtime/dist/remote/gateway.js';
import {PreviewTunnel} from '../runtime/dist/remote/tunnel.js';
import {parseLink} from '../runtime/dist/remote/protocol.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const root=await mkdtemp(join(tmpdir(),'localbot-protocol-fixture-')),publicTest=process.argv.includes('--public'),relay=process.env.LOCALBOT_RELAY_URL;
const binary=join(root,'check');
const gateway=new RemoteGateway(join(root,'devices.json'),'remote',async()=>({fixture:'encrypted Swift to Node'})),tunnel=new PreviewTunnel(),routing=new RoutingPublisher();
try {
 if(spawnSync('swiftc',['-parse-as-library','shared/RemoteClient.swift','scripts/RemoteProtocolCheck.swift','-o',binary],{stdio:'inherit'}).status!==0)throw Error('Swift fixture compilation failed');
 const local=await gateway.start();let url=local,host;
 if(publicTest){
  process.env.LOCALBOT_TUNNEL_BINARY=resolve('build/vendor/tunnel/darwin-arm64/cloudflared');url=await tunnel.start(local);
  if(relay){host=await routing.start(join(root,'host-key.json'),relay,url);url=relay;}
  let ready=false;
  for(let i=0;i<60;i++){
   try{const r=await fetch(url+'/rpc',host?{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ 'x'.repeat(43)},body:JSON.stringify({host,id:'test',requestId:'test',box:'fixture'}),signal:AbortSignal.timeout(5000)}:{signal:AbortSignal.timeout(3000)});if(r.status===(host?401:404)){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready)throw Error('Public tunnel DNS or routing did not become available. Public connectivity is NOT verified.');
 }
 const file=join(root,'pairing.json');await writeFile(file,JSON.stringify(parseLink(await gateway.pairing(url,'Protocol fixture',host))),{mode:0o600});
 const child=spawn(binary,[file],{stdio:'inherit'});if(await new Promise(r=>child.on('exit',r))!==0)throw Error('Swift protocol fixture failed');
 console.log(publicTest?'Public HTTPS fixture passed; physical two-network device test remains.':'Loopback protocol fixture passed; this does not verify cross-network reachability.');
} finally {routing.stop();tunnel.stop();await gateway.close();await rm(root,{recursive:true,force:true});}
