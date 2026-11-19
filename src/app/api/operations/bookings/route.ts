import {fenced} from '@/http/fence'
import {requestContext} from '@/features/auth/context'
import {lookupBooking,searchBookings} from '@/domain/operations/read'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
/** Code lookup locates a booking for signed-in staff; it never proves the holder is the guest. */
async function handleGET(request:Request){
 try{
  const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied()
  const params=new URL(request.url).searchParams,code=params.get('code')
  if(code!==null){const view=await lookupBooking(ctx,code);return view?staffJson(view):staffJson({error:'No booking has that code.'},404)}
  return staffJson({bookings:await searchBookings(ctx,{text:params.get('q')??undefined,from:params.get('from')??undefined,to:params.get('to')??undefined})})
 }catch(error){return staffFailure(error)}
}
export const GET=fenced('authentication',handleGET)
