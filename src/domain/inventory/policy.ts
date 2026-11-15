import {z} from 'zod'
import {parseApprovedPolicy} from '@/domain/policy/parse'
import type {PolicySnapshot} from '@/domain/policy/types'
import {nightsBetween,parsePropertyDate,propertyToday} from '@/domain/shared/dates'
import type {StayRequest} from './types'
export class InventoryInputError extends Error {}
const staySchema=z.object({roomTypeId:z.uuid().optional(),arrival:z.string(),departure:z.string(),occupancy:z.object({adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100)}).strict()}).strict()
const policySchema=z.object({timezone:z.string().min(1),minNights:z.number().int().min(1),maxNights:z.number().int().min(1).max(365),minLeadDays:z.number().int().min(0),maxAdvanceDays:z.number().int().min(0).max(3660),sameDayCutoff:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),turnover:z.literal('same-day')}).strict()
export function requireInventoryPolicy(snapshot:PolicySnapshot,section:string){
  const policy=snapshot.synthetic&&process.env.APP_ENV==='test'?snapshot:parseApprovedPolicy(snapshot,[section])
  if(policy.revision<1||!policy.approvedSections.includes(section)||policy.sections[section]===undefined)throw new Error('Inventory policy requires approval')
  return policy.sections[section]
}
export function validateStay(snapshot:PolicySnapshot,now:string,input:StayRequest){
  const stay=staySchema.parse(input),policy=policySchema.parse(requireInventoryPolicy(snapshot,'stay'))
  if(policy.minNights>policy.maxNights||policy.minLeadDays>policy.maxAdvanceDays||policy.minLeadDays===0&&!policy.sameDayCutoff)throw new Error('Invalid approved stay policy')
  const nights=nightsBetween(stay.arrival,stay.departure),today=propertyToday(policy.timezone,new Date(now))
  const lead=(Date.parse(parsePropertyDate(stay.arrival))-Date.parse(today))/86400000
  if(nights<policy.minNights||nights>policy.maxNights||lead<policy.minLeadDays||lead>policy.maxAdvanceDays)throw new InventoryInputError('Stay dates are outside the approved booking window')
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:policy.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now))
  if(lead===0&&policy.sameDayCutoff&&time>=policy.sameDayCutoff)throw new InventoryInputError('The same-day booking cutoff has passed')
  return {stay,policy,nights}
}
