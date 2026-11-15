import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import {issueCheckoutAccess} from './status'
import {setQuoteBrowser} from './quote-session'
const prefix='acornelia-payment-status-'
const name=(bookingId:string)=>prefix+z.uuid().parse(bookingId)
function serialize(cookieName:string,value:string,maxAge:number){return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(process.env.APP_URL!).protocol==='https:'?'; Secure':''}`}
export function readStatusCookie(request:Request,bookingId:string):string|undefined{return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name(bookingId)+'='))?.slice(name(bookingId).length+1)}
export async function setCheckoutAccess(headers:Headers,ctx:CommandContext,bookingId:string):Promise<void>{
  const access=await issueCheckoutAccess(ctx,bookingId),maxAge=Math.max(1,Math.floor((Date.parse(access.expiresAt)-Date.parse(ctx.clock.now()))/1000))
  headers.append('Set-Cookie',serialize(name(bookingId),access.capability,maxAge))
  setQuoteBrowser(headers,ctx.browserKey!)
}
export function clearStatusCookies(headers:Headers,request:Request){
  for(const part of request.headers.get('cookie')?.split(';')??[]){const cookieName=part.trim().split('=')[0];if(cookieName.startsWith(prefix)&&z.uuid().safeParse(cookieName.slice(prefix.length)).success)headers.append('Set-Cookie',serialize(cookieName,'',0))}
}
