import {z} from 'zod'
import {nightsBetween,parsePropertyDate} from '@/domain/shared/dates'
export interface BookingSearchInput {roomTypeId?:string;arrival:string;departure:string;occupancy:{adults:number;children:number}}
const schema=z.object({roomTypeId:z.uuid().optional(),arrival:z.string(),departure:z.string(),occupancy:z.object({adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100)})})
export function validateBookingSearch(input:unknown):BookingSearchInput{
  const result=schema.parse(input)
  parsePropertyDate(result.arrival);parsePropertyDate(result.departure)
  try{nightsBetween(result.arrival,result.departure)}catch{throw new Error('Check out must be after check in.')}
  return result
}
export function searchParameters(input:BookingSearchInput):URLSearchParams{
  const stay=validateBookingSearch(input)
  return new URLSearchParams({...(stay.roomTypeId?{roomTypeId:stay.roomTypeId}:{}),arrival:stay.arrival,departure:stay.departure,adults:String(stay.occupancy.adults),children:String(stay.occupancy.children)})
}
