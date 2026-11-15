import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {listOwnBookings,CustomerAccessError,HistoryCursorError} from '@/features/customer/bookings'
export async function GET(request:Request){
  const query=new URL(request.url).searchParams
  if([...query.keys()].some(key=>key!=='cursor')||query.getAll('cursor').length>1)return Response.json({error:'Invalid history request'},{status:400})
  const parsed=z.string().max(2048).nullable().safeParse(query.get('cursor'))
  if(!parsed.success)return Response.json({error:'Invalid history request'},{status:400})
  const ctx=await requestContext(request)
  if(ctx.actor.kind!=='customer')return Response.json({error:'Sign in to view your bookings'},{status:401})
  try{return Response.json(await listOwnBookings(ctx,parsed.data))}catch(error){return Response.json({error:'Your booking history is temporarily unavailable'},{status:error instanceof CustomerAccessError?401:error instanceof HistoryCursorError?400:503})}
}
