import {randomBytes} from 'node:crypto'
import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {parseEnvironment} from '@/config/env'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {appendAudit} from '@/domain/audit/append'
import {revokeCapabilities} from './revocation'
import {anonymizedEmail,anonymizedName,revokeOwnedBookingLinks} from './retention'
import type {LifecycleAction,LifecycleResult} from './types'
const reason=z.string().trim().regex(/^[a-z0-9-]{1,60}$/)
const actionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('update-name'),name:z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/)}).strict(),
 z.object({kind:z.literal('change-email'),email:z.string().trim().toLowerCase().pipe(z.email().max(254)),evidenceReference:z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/)}).strict(),
 z.object({kind:z.literal('deactivate'),reason}).strict(),
 z.object({kind:z.literal('anonymize'),reason}).strict(),
 z.object({kind:z.literal('remove-staff'),reason}).strict(),
 z.object({kind:z.literal('release-recovery-hold'),evidenceReference:z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/),collection:z.enum(['customers','staff-users']).default('customers')}).strict(),
])
/** Candidate lifecycle authority pending Decisions 05, 07 and 08. */
export const lifecyclePolicySchema=z.object({selfService:z.object({deactivate:z.boolean(),anonymize:z.boolean()}).strict(),staffRoles:z.array(z.enum(['staff','developer'])).min(1).max(2),staffRemoval:z.boolean()}).strict()
export class LifecycleAccessError extends Error{}
async function removeStaff(tx:DbTx,ctx:CommandContext,id:string,expected:number,value:{reason:string},rule:z.infer<typeof lifecyclePolicySchema>,at:string):Promise<LifecycleResult>{
 if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer'||!rule.staffRemoval)throw new LifecycleAccessError('Only an approved developer can remove staff access')
 if(ctx.actor.id===id)throw new Error('Ask another developer to remove your own access')
 const staff=await tx.payload.findByID({collection:'staff-users',id,depth:0,req:tx.req,overrideAccess:true,showHiddenFields:true})
 if(staff.deactivated)throw new Error('This staff account is already removed')
 if(staff.securityRevision!==expected)throw new Error('The staff account changed; reload before removing it')
 if(staff.role==='developer'){const remaining=await tx.payload.count({collection:'staff-users',where:{and:[{role:{equals:'developer'}},{deactivated:{not_equals:true}},{id:{not_equals:id}}]},req:tx.req,overrideAccess:true});if(!remaining.totalDocs)throw new Error('At least one active developer must remain')}
 // Removal never changes the recorded role; there is deliberately no lifecycle action that restores access.
 const revision=await revokeCapabilities(tx,{collection:'staff-users',id},value.reason,at,{deactivated:true})
 await appendAudit(tx,{action:'staff:removed',recordType:'staff-users',recordId:id,outcome:'success',safeChanges:{reasonCode:value.reason,role:staff.role}})
 return {collection:'staff-users',id,state:'removed',securityRevision:revision}
}
/** Re-enables an account held by a restore after staff confirmed it against records outside the restored database. */
async function releaseHold(tx:DbTx,ctx:CommandContext,id:string,expected:number,value:{evidenceReference:string;collection:'customers'|'staff-users'},rule:z.infer<typeof lifecyclePolicySchema>,at:string):Promise<LifecycleResult>{
 const staffAccount=value.collection==='staff-users'
 if(ctx.actor.kind!=='staff'||(staffAccount?ctx.actor.role!=='developer'||ctx.actor.id===id:!rule.staffRoles.includes(ctx.actor.role)))throw new LifecycleAccessError('Only approved staff can release a restore hold')
 const account=await tx.payload.findByID({collection:value.collection,id,depth:0,req:tx.req,overrideAccess:true,showHiddenFields:true}) as {securityRevision?:number|null;recoveryHoldAt?:string|null}
 if((account.securityRevision??1)!==expected)throw new Error('The account changed; reload before releasing it')
 if(!account.recoveryHoldAt)throw new Error('Only an account held by a restore can be released this way')
 const revision=await revokeCapabilities(tx,{collection:value.collection,id},'recovery-hold-released',at,{deactivated:false,recoveryHoldAt:null})
 await appendAudit(tx,{action:'account:recovery-hold-released',recordType:value.collection,recordId:id,outcome:'success',safeChanges:{reasonCode:'verified-outside-restore'}})
 return {collection:value.collection,id,state:'active',securityRevision:revision}
}
/**
 * Applies one customer or staff lifecycle action against the account's current security revision.
 * Booking ownership never moves; email changes, deactivation and anonymization revoke prior access.
 */
export async function applyAccountLifecycle(ctx:CommandContext,accountId:string,expectedRevision:number,action:LifecycleAction):Promise<LifecycleResult>{
 const id=z.uuid().parse(accountId),expected=z.number().int().positive().parse(expectedRevision),value=actionSchema.parse(action)
 if(parseEnvironment(process.env).operationMode!=='normal')throw new LifecycleAccessError('Account changes are paused')
 return ctx.uow.run(ctx.actor,async tx=>{
  const rule=lifecyclePolicySchema.parse((await requireCurrentPolicy(tx,ctx,['accountLifecycle'])).sections.accountLifecycle),at=ctx.clock.now()
  if(value.kind==='remove-staff')return removeStaff(tx,ctx,id,expected,value,rule,at)
  if(value.kind==='release-recovery-hold')return releaseHold(tx,ctx,id,expected,value,rule,at)
  const self=ctx.actor.kind==='customer'&&ctx.actor.id===id,staff=ctx.actor.kind==='staff'&&rule.staffRoles.includes(ctx.actor.role)
  if(self?!(value.kind==='deactivate'&&rule.selfService.deactivate||value.kind==='anonymize'&&rule.selfService.anonymize):!staff)throw new LifecycleAccessError('This account change is not available to you')
  const customer=await tx.payload.findByID({collection:'customers',id,depth:0,req:tx.req,overrideAccess:true,showHiddenFields:true})
  if(customer.securityRevision!==expected)throw new Error('The account changed; reload before changing it again')
  if(customer.anonymizedAt)throw new Error('An anonymized account cannot change')
  if(customer.deactivated&&value.kind!=='anonymize')throw new Error('A deactivated account can only be anonymized')
  const result=(state:LifecycleResult['state'],securityRevision:number):LifecycleResult=>({collection:'customers',id,state,securityRevision})
  if(value.kind==='update-name'){
   // Every lifecycle change advances the revision so competing account changes cannot both apply.
   await tx.payload.update({collection:'customers',id,data:{name:value.name,securityRevision:customer.securityRevision+1},req:tx.req,overrideAccess:true})
   await appendAudit(tx,{action:'account:profile-updated',recordType:'customers',recordId:id,outcome:'success',safeChanges:{fieldsChanged:['name']}})
   return result('active',customer.securityRevision+1)
  }
  if(value.kind==='change-email'){
   const taken=await tx.payload.count({collection:'customers',where:{and:[{email:{equals:value.email}},{id:{not_equals:id}}]},req:tx.req,overrideAccess:true})
   if(taken.totalDocs)throw new Error('That email belongs to another account')
   const revision=await revokeCapabilities(tx,{collection:'customers',id},'email-changed',at,{email:value.email})
   await appendAudit(tx,{action:'account:email-changed',recordType:'customers',recordId:id,outcome:'success',safeChanges:{reasonCode:'staff-verified-identity'}})
   return result('active',revision)
  }
  if(value.kind==='deactivate'){
   const revision=await revokeCapabilities(tx,{collection:'customers',id},value.reason,at,{deactivated:true})
   await appendAudit(tx,{action:'account:deactivated',recordType:'customers',recordId:id,outcome:'success',safeChanges:{reasonCode:value.reason}})
   return result('deactivated',revision)
  }
  const revision=await revokeCapabilities(tx,{collection:'customers',id},value.reason,at,{name:anonymizedName,email:anonymizedEmail(id),deactivated:true,anonymizedAt:at,password:randomBytes(48).toString('base64url')})
  const links=await revokeOwnedBookingLinks(tx,id,at)
  await appendAudit(tx,{action:'account:anonymized',recordType:'customers',recordId:id,outcome:'success',safeChanges:{reasonCode:value.reason,count:links}})
  return result('anonymized',revision)
 })
}
