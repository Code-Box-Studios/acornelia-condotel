import {opaqueSecret} from '@/domain/security/private-state'
const cookieName='acornelia-quote-browser'
export function readQuoteBrowser(request:Request,create=false):string|undefined{
  const value=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1)
  return value&&/^[A-Za-z0-9_-]{43}$/.test(value)?value:create?opaqueSecret():undefined
}
function serialize(value:string,maxAge:number){return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.APP_ENV==='production'?'; Secure':''}`}
export function setQuoteBrowser(headers:Headers,key:string):void{headers.append('Set-Cookie',serialize(key,3600))}
export function clearQuoteBrowser(headers:Headers):void{headers.append('Set-Cookie',serialize('',0))}
