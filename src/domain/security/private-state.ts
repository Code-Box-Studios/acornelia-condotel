import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
function key(){const secret=process.env.PAYLOAD_SECRET;if(!secret||secret.length<32)throw new Error('Private state encryption requires a configured application secret');return createHash('sha256').update('acornelia:short-lived-private-state:v1\0'+secret).digest()}
/** Short-lived draft/auth-delivery state expires when the application secret rotates. */
export function encryptPrivateState(value:unknown,scope:string):string{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv)
  cipher.setAAD(Buffer.from(scope))
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
  return JSON.stringify({v:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')})
}
export function decryptPrivateState(value:string,scope:string):unknown{
  const envelope=z.object({v:z.literal(1),iv:z.string().max(30),tag:z.string().max(30),ciphertext:z.string().max(100000)}).strict().parse(JSON.parse(value))
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(envelope.iv,'base64url'))
  decipher.setAAD(Buffer.from(scope));decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]).toString('utf8'))
}
export function privateDigest(value:string):string{return createHash('sha256').update(value).digest('hex')}
export function matchesPrivateDigest(value:string,hash:string):boolean{if(!/^[a-f0-9]{64}$/.test(hash))return false;return timingSafeEqual(Buffer.from(privateDigest(value),'hex'),Buffer.from(hash,'hex'))}
export function opaqueSecret():string{return randomBytes(32).toString('base64url')}
