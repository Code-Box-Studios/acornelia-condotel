import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import {parseEnvironment} from '@/config/env'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {propertyToday} from '@/domain/shared/dates'
const roles=z.array(z.enum(['staff','developer'])).min(1).max(2)
export const changePolicySchema=z.object({enabled:z.boolean(),roles,minHoursBeforeArrival:z.number().int().min(0).max(8760),offerChanges:z.literal('unavailable'),paymentMinutes:z.number().int().min(1).max(1440),cancellation:z.object({enabled:z.boolean(),roles,minHoursBeforeArrival:z.number().int().min(0).max(8760),refund:z.literal('separate-authorization'),offerUsage:z.literal('retain')}).strict()}).strict()
export function changeStaffAllowed(ctx:CommandContext){try{const rule=changePolicySchema.parse(parseRuntimePolicy(ctx.policy,['stayChanges']).sections.stayChanges);return ctx.actor.kind==='staff'&&rule.enabled&&rule.roles.includes(ctx.actor.role)}catch{return false}}
export async function requireChangePolicy(tx:DbTx,ctx:CommandContext,cancellation=false,allowDisabled=false){
 if(ctx.actor.kind!=='staff'||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Authorized staff access required')
 const policy=await requireCurrentPolicy(tx,ctx,['stayChanges','stay']),rule=changePolicySchema.parse(policy.sections.stayChanges),authority=cancellation?rule.cancellation:rule
 if(!authority.enabled&&!allowDisabled||!authority.roles.includes(ctx.actor.role))throw new Error('This stay action is unavailable')
 return rule
}
export function requireChangeable(ctx:CommandContext,booking:Booking,expectedRevision:number,cancellation=false){
 z.number().int().positive().parse(expectedRevision)
 if(booking.status!=='confirmed'||booking.revision!==expectedRevision)throw new Error('Review the current confirmed booking revision')
 const rule=changePolicySchema.parse(ctx.policy.sections.stayChanges),hours=(cancellation?rule.cancellation:rule).minHoursBeforeArrival,timezone=z.string().parse((ctx.policy.sections.stay as {timezone?:string})?.timezone)
 // The candidate defines cutoff against midnight on the property arrival date.
 // Compare property-local wall time rather than assuming UTC or the operator timezone.
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ctx.clock.now())),part=(type:string)=>parts.find(value=>value.type===type)!.value
 const wall=Date.parse(`${propertyToday(timezone,new Date(ctx.clock.now()))}T${part('hour')}:${part('minute')}:${part('second')}Z`),arrival=Date.parse(booking.arrival.slice(0,10)+'T00:00:00Z')
 if(wall>arrival-hours*3600000)throw new Error('The approved stay-action cutoff has passed')
}
