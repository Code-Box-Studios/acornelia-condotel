import {fenced} from '@/http/fence'
import {requestContext} from '@/features/auth/context'
import {validateBookingSearch} from '@/features/booking/search'
import {findAvailability} from '@/domain/inventory/availability'
import {InventoryInputError} from '@/domain/inventory/policy'
const allowed=new Set(['arrival','departure','adults','children','roomTypeId'])
async function handleGET(request:Request){
  const params=new URL(request.url).searchParams
  if([...params.keys()].some(key=>!allowed.has(key)||params.getAll(key).length!==1))return Response.json({error:'Review the stay dates and guest count.'},{status:400})
  let stay
  try{stay=validateBookingSearch({arrival:params.get('arrival'),departure:params.get('departure'),occupancy:{adults:Number(params.get('adults')),children:Number(params.get('children'))},...(params.has('roomTypeId')?{roomTypeId:params.get('roomTypeId')}:{})})}
  catch{return Response.json({error:'Review the stay dates and guest count.'},{status:400})}
  try{return Response.json({items:await findAvailability(await requestContext(request),stay)})}
  catch(error){return Response.json({error:error instanceof InventoryInputError?'Review the stay dates and guest count.':'Availability is being prepared. Please contact Acornelia.'},{status:error instanceof InventoryInputError?400:503})}
}
export const GET=fenced('business-write',handleGET)
