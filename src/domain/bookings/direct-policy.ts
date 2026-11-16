import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {parseEnvironment} from '@/config/env'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {requireCurrentPolicy} from '@/domain/policy/current'
export const directPolicySchema=z.object({enabled:z.boolean(),payment:z.literal('full-upfront'),unpaid:z.literal('unavailable'),roles:z.array(z.enum(['staff','developer'])).min(1).max(2),methods:z.array(z.enum(['cash','bank-transfer'])).min(1).max(2),currency:z.literal('PHP'),maxAmountMinor:z.string().regex(/^[1-9]\d*$/).max(60),evidence:z.literal('staff-attested-with-reference'),maxBackdateDays:z.number().int().min(0).max(3650),futureToleranceSeconds:z.number().int().min(0).max(300)}).strict()
export type DirectBookingPolicy=z.infer<typeof directPolicySchema>
export function directStaffAllowed(ctx:CommandContext):boolean{
  if(ctx.actor.kind!=='staff')return false
  try{const rule=directPolicySchema.parse(parseRuntimePolicy(ctx.policy,['directBookings']).sections.directBookings);return rule.enabled&&rule.roles.includes(ctx.actor.role)}catch{return false}
}
export function assertDirectStaff(ctx:CommandContext){if(ctx.actor.kind!=='staff'||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Authorized staff access required')}
export async function requireDirectPolicy(tx:DbTx,ctx:CommandContext,creation=false):Promise<DirectBookingPolicy>{
  assertDirectStaff(ctx)
  const policy=await requireCurrentPolicy(tx,ctx,creation?['directBookings','stay','pricing','bookingTerms','checkout']:['directBookings']),rule=directPolicySchema.parse(policy.sections.directBookings)
  if(ctx.actor.kind!=='staff'||!rule.roles.includes(ctx.actor.role)||creation&&!rule.enabled)throw new Error('Direct bookings are unavailable')
  const legacy=await tx.payload.count({collection:'payment-transactions',where:{and:[{environment:{equals:'offline'}},{or:[{offlineEvidence:{exists:false}},{offlineReceiptKey:{exists:false}},{recordedByStaff:{exists:false}}]}]},req:tx.req,overrideAccess:false})
  if(legacy.totalDocs)throw new Error('Review legacy offline collections before recording new money')
  return rule
}
