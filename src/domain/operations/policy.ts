import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {parseEnvironment} from '@/config/env'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {requireCurrentPolicy} from '@/domain/policy/current'
/** A refusal written for staff; routes may show its message. */
export class StaffFacingError extends Error{}
/** The signed-in principal lacks the approved operations capability. */
export class OperationsAccessError extends StaffFacingError{}
const roles=z.array(z.enum(['staff','developer'])).min(1).max(2)
/** Candidate staff powers pending Decision 08; every capability names the roles allowed to use it. */
export const operationsPolicySchema=z.object({roles:z.object({view:roles,stay:roles,notes:roles,issues:roles,enquiries:roles,reports:roles,exports:roles}).strict(),noShowFromHour:z.number().int().min(0).max(23),upcomingDays:z.number().int().min(1).max(60),reportMaxDays:z.number().int().min(1).max(400)}).strict()
export type OperationsPolicy=z.infer<typeof operationsPolicySchema>
export type OperationsCapability=keyof OperationsPolicy['roles']
const staySchema=z.object({timezone:z.string().min(1)}).passthrough()
export function operationsStaff(ctx:CommandContext){if(ctx.actor.kind!=='staff'||parseEnvironment(process.env).operationMode!=='normal')throw new OperationsAccessError('Authorized staff access required')}
export async function requireOperations(tx:DbTx,ctx:CommandContext,capability:OperationsCapability):Promise<{rule:OperationsPolicy;timezone:string}>{
 operationsStaff(ctx)
 const policy=await requireCurrentPolicy(tx,ctx,['operations','stay']),rule=operationsPolicySchema.parse(policy.sections.operations),timezone=staySchema.parse(policy.sections.stay).timezone
 if(ctx.actor.kind!=='staff'||!rule.roles[capability].includes(ctx.actor.role))throw new OperationsAccessError('This staff action is not approved for your role')
 return {rule,timezone}
}
/** Screen-level hint only; every command re-checks the stored policy. */
export function operationsAllowed(ctx:CommandContext,capability:OperationsCapability):boolean{
 if(ctx.actor.kind!=='staff')return false
 try{return operationsPolicySchema.parse(parseRuntimePolicy(ctx.policy,['operations']).sections.operations).roles[capability].includes(ctx.actor.role)}catch{return false}
}
export function operationsTimezone(ctx:CommandContext):string{try{return staySchema.parse(parseRuntimePolicy(ctx.policy,['stay']).sections.stay).timezone}catch{return 'Asia/Manila'}}
