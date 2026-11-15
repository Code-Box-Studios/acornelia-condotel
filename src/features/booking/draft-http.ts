import type {CommandContext} from '@/domain/db/types'
import {opaqueSecret} from '@/domain/security/private-state'
import type {DraftRef,DraftSession} from './draft'
const refName='acornelia-checkout-ref',browserName='acornelia-checkout-browser'
function cookie(headers:Headers,name:string):string|undefined{return headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1)}
export function readDraftSession(request:Request,ctx:CommandContext,create=false):DraftSession|null{
  const existing=cookie(request.headers,browserName)
  const browserKey=existing&&/^[A-Za-z0-9_-]{43}$/.test(existing)?existing:create?opaqueSecret():undefined
  if(!browserKey)return null
  let ref:DraftRef|undefined
  const raw=cookie(request.headers,refName)
  if(existing&&raw&&raw.length<1000){try{const parsed=JSON.parse(Buffer.from(raw,'base64url').toString());if(typeof parsed.id==='string'&&typeof parsed.secret==='string'&&Number.isInteger(parsed.version))ref=parsed}catch{/* Unrecognized cookies do not grant access. */}}
  return {ctx,browserKey,ref}
}
function serialize(name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.APP_ENV==='production'?'; Secure':''}`}
export function setDraftCookies(headers:Headers,session:DraftSession,ref:DraftRef):void{
  headers.append('Set-Cookie',serialize(browserName,session.browserKey,1800))
  headers.append('Set-Cookie',serialize(refName,Buffer.from(JSON.stringify(ref)).toString('base64url'),1800))
}
export function clearDraftCookies(headers:Headers):void{headers.append('Set-Cookie',serialize(browserName,'',0));headers.append('Set-Cookie',serialize(refName,'',0))}
