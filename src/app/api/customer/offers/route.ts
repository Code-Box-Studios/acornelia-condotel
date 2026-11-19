import {fenced} from '@/http/fence'
import {requestContext} from '@/features/auth/context'
import {readMyOffers} from '@/features/customer/offers'
import {CustomerAccessError} from '@/features/customer/bookings'
async function handleGET(request:Request){
  if(new URL(request.url).searchParams.size)return Response.json({error:'Invalid offer request'},{status:400})
  const ctx=await requestContext(request)
  if(ctx.actor.kind!=='customer')return Response.json({error:'Sign in to view your account offers'},{status:401})
  try{return Response.json(await readMyOffers(ctx))}catch(error){return Response.json({error:'Account offers are temporarily unavailable'},{status:error instanceof CustomerAccessError?401:503})}
}
export const GET=fenced('authentication',handleGET)
