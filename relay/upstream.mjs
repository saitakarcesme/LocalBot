import https from 'node:https';
// Some resolvers return NXDOMAIN for the wildcard Quick Tunnel domain.
// Resolve only this allowlisted domain through Cloudflare's HTTPS resolver;
// HTTPS still validates the original hostname and certificate normally.
async function tunnelLookup(hostname,options,callback){
 try {
  if(!/^[a-z0-9-]+\.trycloudflare\.com$/.test(hostname))throw Error('Invalid tunnel hostname');
  const response=await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(hostname)+'&type=A',{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)throw Error('DNS service unavailable');const result=await response.json();
  const address=result.Answer?.find(a=>a.type===1&&/^(104\.1[6-9]\.|104\.2[0-9]\.|172\.6[4-9]\.|172\.7[0-1]\.)/.test(a.data))?.data;
  if(!address)throw Error('No public Cloudflare tunnel address');
  callback(null,...(options?.all?[[{address,family:4}]]:[address,4]));
 }catch(error){callback(error);}
}
export function forwardTunnel(url,authorization,body){
 return new Promise((resolve,reject)=>{
  const request=https.request(url,{method:'POST',lookup:tunnelLookup,headers:{'Content-Type':'application/json',Authorization:authorization,'Content-Length':Buffer.byteLength(body)}},response=>{
   const chunks=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>4000000){request.destroy(Error('Response limit'));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode??502,body:Buffer.concat(chunks)}));
  });
  const timer=setTimeout(()=>request.destroy(Error('Host request timed out')),110000);
  request.on('error',reject);request.on('close',()=>clearTimeout(timer));request.end(body);
 });
}
