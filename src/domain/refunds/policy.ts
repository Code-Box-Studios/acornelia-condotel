import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {parseEnvironment} from '@/config/env'
import {requireCurrentPolicy} from '@/domain/policy/current'
export const refundPolicySchema=z.object({enabled:z.boolean(),roles:z.array(z.enum(['staff','developer'])).min(1).max(2),methods:z.array(z.enum(['refund','void','offline'])).min(1).max(3),currency:z.literal('PHP'),maxAmountMinor:z.string().regex(/^[1-9]\d*$/).max(60),externalActions:z.literal('pause-before-manual'),offlineReview:z.enum(['disabled','independent-staff']),manualResolution:z.enum(['disabled','independent-provider-review']).default('disabled'),reconcileSeconds:z.number().int().min(5).max(3600),maxChecks:z.number().int().min(1).max(1000)}).strict()
export function refundStaff(ctx:CommandContext){if(ctx.actor.kind!=='staff'||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Authorized refund staff required')}
export async function requireRefundPolicy(tx:DbTx,ctx:CommandContext,creation=false){
 refundStaff(ctx)
 const policy=await requireCurrentPolicy(tx,ctx,['refunds']),rule=refundPolicySchema.parse(policy.sections.refunds)
 if(ctx.actor.kind!=='staff'||!rule.roles.includes(ctx.actor.role)||creation&&!rule.enabled)throw new Error('Refund authority is unavailable')
 return rule
}
