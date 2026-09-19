import{mkdir,writeFile,readFile,chmod}from'node:fs/promises';import{join}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const target=process.argv[2]??(process.platform==='win32'?'windows-amd64':'darwin-arm64');
const assets={
 'darwin-arm64':['cloudflared-darwin-arm64.tgz','c27ab8fd0aa489449e3d201eb02f957ef460a13b613662928b1b23394bf1bcfe'],
 'windows-amd64':['cloudflared-windows-amd64.exe','2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712']};
if(!assets[target])throw Error('Unsupported tunnel platform: '+target);
const[name,sha]=assets[target],dir=join('build','vendor','tunnel',target);await mkdir(dir,{recursive:true});const archive=join(dir,name);
let bytes=await readFile(archive).catch(()=>null);
if(!bytes||createHash('sha256').update(bytes).digest('hex')!==sha){const r=await fetch('https://github.com/cloudflare/cloudflared/releases/download/2026.9.1/'+name);if(!r.ok)throw Error('Tunnel download failed');bytes=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Tunnel checksum mismatch');await writeFile(archive,bytes);}
if(name.endsWith('.tgz')){const r=spawnSync('tar',['-xzf',archive,'-C',dir]);if(r.status!==0)throw Error('Could not unpack tunnel');await chmod(join(dir,'cloudflared'),0o755);}
console.log('Verified Cloudflare tunnel 2026.9.1 for '+target);
