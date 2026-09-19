import {RemoteGateway} from '../runtime/dist/remote/gateway.js';
import {PreviewTunnel} from '../runtime/dist/remote/tunnel.js';
import {parseLink} from '../runtime/dist/remote/protocol.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const root=await mkdtemp(join(tmpdir(),'localbot-protocol-fixture-')),publicTest=process.argv.includes('--public');
const binary=join(root,'check');
const gateway=new RemoteGateway(join(root,'devices.json'),'remote',async()=>({fixture:'encrypted Swift to Node'})),tunnel=new PreviewTunnel();
try {
 if(spawnSync('swiftc',['-parse-as-library','shared/RemoteClient.swift','scripts/RemoteProtocolCheck.swift','-o',binary],{stdio:'inherit'}).status!==0)throw Error('Swift fixture compilation failed');
 const local=await gateway.start();let url=local;
 if(publicTest){
  process.env.LOCALBOT_TUNNEL_BINARY=resolve('build/vendor/tunnel/darwin-arm64/cloudflared');url=await tunnel.start(local);
  let ready=false;
  for(let i=0;i<60;i++){
   try{const r=await fetch(url+'/rpc',{signal:AbortSignal.timeout(3000)});if(r.status===404){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready)throw Error('Public tunnel DNS or routing did not become available. Public connectivity is NOT verified.');
 }
 const file=join(root,'pairing.json');await writeFile(file,JSON.stringify(parseLink(await gateway.pairing(url,'Protocol fixture'))),{mode:0o600});
 const child=spawn(binary,[file],{stdio:'inherit'});if(await new Promise(r=>child.on('exit',r))!==0)throw Error('Swift protocol fixture failed');
 console.log(publicTest?'Public HTTPS fixture passed; physical two-network device test remains.':'Loopback protocol fixture passed; this does not verify cross-network reachability.');
} finally {tunnel.stop();await gateway.close();await rm(root,{recursive:true,force:true});}
