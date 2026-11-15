import {z} from 'zod'
import type {DbTx} from '@/domain/db/types'
import type {Allocation} from '@/payload-types'
import {commandActor} from '@/payload/access/internal'
import {dateToStorage,nightsBetween} from '@/domain/shared/dates'
import {relationshipId} from '@/features/customer/bookings'
import {validateStay} from './policy'
import {freePhysicalRooms} from './availability'
import type {AllocationRequest} from './types'
export class InventoryConflict extends Error {constructor(){super('The selected room is no longer available')}}
function sqlCode(error:unknown,depth=0):string|undefined{if(!error||typeof error!=='object'||depth>6)return;const value=error as {code?:string;cause?:unknown};return value.code??sqlCode(value.cause,depth+1)}
function trusted(tx:DbTx){
  if(!commandActor(tx.req)||!tx.req.transactionID)throw new Error('Inventory requires a trusted transaction')
  if(tx.actor.kind==='system'&&tx.actor.purpose==='email')throw new Error('Email delivery cannot mutate inventory')
}
export async function allocate(tx:DbTx,request:AllocationRequest):Promise<Allocation>{
  trusted(tx)
  let roomId:string,arrival:string,departure:string,bookingId:string|undefined
  if(request.purpose==='block'){
    if(tx.actor.kind!=='staff'||tx.actor.role!=='developer')throw new Error('Room blocking requires an authorized operator')
    z.uuid().parse(request.roomId);nightsBetween(request.arrival,request.departure)
    await tx.payload.findByID({collection:'rooms',id:request.roomId,depth:0,req:tx.req,overrideAccess:false})
    roomId=request.roomId;arrival=request.arrival;departure=request.departure
  }else{
    const {stay}=validateStay(request.policy,request.now,request.stay)
    if(!stay.roomTypeId)throw new Error('Choose a room type')
    z.uuid().parse(request.bookingId)
    const booking=await tx.payload.findByID({collection:'bookings',id:request.bookingId,depth:0,req:tx.req,overrideAccess:false})
    if(booking.arrival!==dateToStorage(stay.arrival)||booking.departure!==dateToStorage(stay.departure)||booking.status!==(request.purpose==='hold'?'held':'confirmed'))throw new Error('Allocation does not match the booking transition')
    if(request.purpose==='hold'&&(!request.deadline||!z.iso.datetime().safeParse(request.deadline).success||Date.parse(request.deadline)<=Date.parse(request.now)))throw new Error('A future payment-hold deadline is required')
    const existing=(await tx.payload.find({collection:'allocations',where:{and:[{booking:{equals:booking.id}},{released:{equals:false}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(existing)throw new Error('Booking already has an active allocation')
    const room=(await freePhysicalRooms(tx,stay)).rooms[0]
    if(!room)throw new InventoryConflict()
    roomId=room.id;arrival=stay.arrival;departure=stay.departure;bookingId=booking.id
  }
  try{return await tx.payload.create({collection:'allocations',data:{room:roomId,booking:bookingId,arrival:dateToStorage(arrival),departure:dateToStorage(departure),purpose:request.purpose,released:false,...(request.purpose==='hold'?{deadline:request.deadline}:{})},req:tx.req,overrideAccess:false})}
  catch(error){if(sqlCode(error)==='23P01')throw new InventoryConflict();throw error}
}
/** Internal transition helper. Callers must update the booking/block state in the same transaction. */
export async function release(tx:DbTx,id:string):Promise<void>{
  trusted(tx);z.uuid().parse(id)
  const allocation=await tx.payload.findByID({collection:'allocations',id,depth:0,req:tx.req,overrideAccess:false})
  if(allocation.released)return
  if(tx.actor.kind!=='staff'&&tx.actor.kind!=='system')throw new Error('Inventory release requires an authorized transition')
  if(tx.actor.kind==='staff'&&tx.actor.role!=='developer')throw new Error('Inventory release requires an authorized operator')
  if(allocation.purpose!=='block'){
    const bookingId=relationshipId(allocation.booking)
    if(!bookingId)throw new Error('Booking allocation is missing its booking')
    const booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
    if(!['expired','cancelled','completed'].includes(booking.status))throw new Error('Booking must transition before releasing inventory')
  }
  await tx.payload.update({collection:'allocations',id,data:{released:true},req:tx.req,overrideAccess:false})
}
