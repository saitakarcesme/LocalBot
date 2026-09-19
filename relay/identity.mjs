import {createHash,createPublicKey,verify} from 'node:crypto';
export function validateRegistration(value) {
  if(!value || typeof value.publicKey!=='string' || value.publicKey.length>200 || typeof value.signature!=='string' || value.signature.length>200 || !Number.isFinite(value.expires) || value.expires<Date.now() || value.expires>Date.now()+300000)throw Error('Invalid registration');
  const key=createPublicKey({key:Buffer.from(value.publicKey,'base64'),format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ed25519')throw Error('Invalid host key');
  const host=createHash('sha256').update(Buffer.from(value.publicKey,'base64')).digest('base64url');
  const url=new URL(value.url);
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname!=='/')throw Error('Invalid tunnel address');
  if(!verify(null,Buffer.from(`localbot.route.v1|${host}|${url.origin}|${value.expires}`),key,Buffer.from(value.signature,'base64')))throw Error('Invalid host signature');
  return {host,url:url.origin,expires:value.expires};
}
