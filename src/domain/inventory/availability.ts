import type {Where} from 'payload'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {dateToStorage} from '@/domain/shared/dates'
import {relationshipId} from '@/features/customer/bookings'
import {plain} from '@/content/public-property'
import {validateStay,InventoryInputError} from './policy'
import type {StayRequest,AvailableRoomType} from './types'

export async function freePhysicalRooms(tx:DbTx,stay:StayRequest,excludeBookingId?:string){
  const conditions:Where[]=[{onSale:{equals:true}},{_status:{equals:'published'}},...(stay.roomTypeId?[{id:{equals:stay.roomTypeId}}]:[]),...(process.env.APP_ENV==='production'?[{synthetic:{equals:false}}]:[])]
  const types=await tx.payload.find({collection:'room-types',where:{and:conditions},draft:false,limit:1000,depth:0,req:tx.req,overrideAccess:true})
  if(types.hasNextPage)throw new Error('Inventory catalog requires operator review')
  const totalGuests=stay.occupancy.adults+stay.occupancy.children
  if(stay.roomTypeId&&types.docs[0]?.maxGuests!=null&&types.docs[0].maxGuests<totalGuests)throw new InventoryInputError('Guest count exceeds room capacity')
  const eligible=types.docs.filter(type=>type.maxGuests!=null&&type.maxGuests>=totalGuests)
  if(!eligible.length)return {types:eligible,rooms:[]}
  const rooms=await tx.payload.find({collection:'rooms',where:{and:[{onSale:{equals:true}},{roomType:{in:eligible.map(type=>type.id)}}]},limit:10000,sort:'id',depth:0,req:tx.req,overrideAccess:false})
  if(rooms.hasNextPage)throw new Error('Physical inventory requires operator review')
  if(!rooms.docs.length)return {types:eligible,rooms:[]}
  const occupied=await tx.payload.find({collection:'allocations',where:{and:[{room:{in:rooms.docs.map(room=>room.id)}},...(excludeBookingId?[{or:[{booking:{not_equals:excludeBookingId}},{booking:{exists:false}}]}]:[]),{released:{equals:false}},{arrival:{less_than:dateToStorage(stay.departure)}},{departure:{greater_than:dateToStorage(stay.arrival)}}]},limit:10000,depth:0,req:tx.req,overrideAccess:false})
  if(occupied.hasNextPage)throw new Error('Occupied inventory requires operator review')
  const unavailable=new Set(occupied.docs.map(allocation=>relationshipId(allocation.room)))
  return {types:eligible,rooms:rooms.docs.filter(room=>!unavailable.has(room.id))}
}
export async function findAvailability(ctx:CommandContext,input:StayRequest):Promise<AvailableRoomType[]>{
  const {stay}=validateStay(ctx.policy,ctx.clock.now(),input)
  return ctx.uow.run(ctx.actor,async tx=>{
    const {types,rooms}=await freePhysicalRooms(tx,stay)
    return types.map(type=>({id:type.id,name:plain(type.name),slug:type.slug,maxGuests:type.maxGuests!,availableUnits:rooms.filter(room=>relationshipId(room.roomType)===type.id).length})).filter(type=>type.availableUnits>0)
  })
}
