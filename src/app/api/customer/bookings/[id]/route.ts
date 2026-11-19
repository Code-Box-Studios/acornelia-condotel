import {fenced} from '@/http/fence'
import {requestContext} from '@/features/auth/context'
import {readOwnBooking,CustomerAccessError} from '@/features/customer/bookings'
async function handleGET(request:Request,{params}:{params:Promise<{id:string}>}){
  const ctx=await requestContext(request)
  if(ctx.actor.kind!=='customer')return Response.json({error:'Sign in to view your bookings'},{status:401})
  try{
    const result=await readOwnBooking(ctx,(await params).id)
    return result?Response.json(result):Response.json({error:'Booking unavailable'},{status:404})
  }catch(error){return Response.json({error:'Booking unavailable'},{status:error instanceof CustomerAccessError?401:503})}
}
export const GET=fenced('authentication',handleGET)
