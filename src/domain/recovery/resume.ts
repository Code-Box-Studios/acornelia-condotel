import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import {fenceFrom} from '@/config/operation-mode'
import {appendAudit} from '@/domain/audit/append'
import {databaseGeneration} from './fence'
import {invalidateRestoredCapabilities} from './reconcile'
const instant=z.iso.datetime({offset:true})
const evidenceSchema=z.object({generation:z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),operator:z.string().trim().min(3).max(120).regex(/^[^\u0000-\u001f\u007f]+$/),backupTakenAt:instant,restoredAt:instant,providerReconciliation:z.literal('completed'),postBackupReview:z.literal('completed'),measuredRecoveryMinutes:z.number().int().min(0).max(100000),approvedTargetMinutes:z.number().int().min(1).max(100000)}).strict()
export type ResumptionEvidence=z.infer<typeof evidenceSchema>
export const resumptionStages=['provider-intake','reconciliation','workers','authentication','business-writes'] as const
export type ResumptionPermit={generation:string;previousGeneration:string|null;operator:string;issuedAt:string;stages:readonly string[];withinTarget:boolean}
function canonical(evidence:ResumptionEvidence){const value=evidenceSchema.parse(evidence);return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))))}
/** Computed by the operator outside the application with the independent recovery key. */
export function signResumptionEvidence(evidence:ResumptionEvidence,key:string){return createHmac('sha256',key).update('acornelia-resumption\0'+canonical(evidence)).digest('hex')}
/**
 * Accepts the external recovery generation only with evidence signed by the independent operator
 * key, never a restored login or session. It first invalidates every restored capability, then
 * records the permit. The operator switches the environment to normal afterwards.
 */
export async function authorizeResumption(ctx:CommandContext,input:ResumptionEvidence&{signature:string}):Promise<ResumptionPermit>{
 if(ctx.actor.kind!=='system'||ctx.actor.purpose!=='recovery')throw new Error('Recovery operator authority required')
 const {signature,...rest}=input,evidence=evidenceSchema.parse(rest),key=process.env.RECOVERY_OPERATOR_KEY
 if(!key||key.length<32)throw new Error('The independent recovery key is not configured')
 const expected=Buffer.from(signResumptionEvidence(evidence,key)),given=Buffer.from(z.string().regex(/^[a-f0-9]{64}$/).parse(signature))
 if(expected.length!==given.length||!timingSafeEqual(expected,given))throw new Error('Recovery evidence signature is invalid')
 const fence=fenceFrom(process.env,null)
 if(fence.mode==='normal')throw new Error('Authorize resumption while the service is in quarantine or reconcile mode')
 if(evidence.generation!==fence.expectedGeneration)throw new Error('Evidence does not match the external recovery generation')
 if(Date.parse(evidence.restoredAt)<Date.parse(evidence.backupTakenAt))throw new Error('The restore cannot precede its backup')
 return ctx.uow.run(ctx.actor,async tx=>{
  const current=await databaseGeneration(tx.payload,tx.req),stages=resumptionStages,withinTarget=evidence.measuredRecoveryMinutes<=evidence.approvedTargetMinutes
  if(current===evidence.generation){
   const row=(await tx.payload.find({collection:'recovery-fences',where:{generation:{equals:evidence.generation}},limit:1,depth:0,req:tx.req,overrideAccess:true})).docs[0]
   if(row?.operator!==evidence.operator)throw new Error('This generation was authorized by another operator')
   return {generation:row.generation,previousGeneration:row.previousGeneration??null,operator:row.operator,issuedAt:row.authorizedAt,stages,withinTarget}
  }
  const at=ctx.clock.now(),invalidated=await invalidateRestoredCapabilities(tx,at)
  await tx.payload.create({collection:'recovery-fences',data:{generation:evidence.generation,previousGeneration:current,operator:evidence.operator,authorizedAt:at,permit:{version:1,stages:[...stages],evidence:{backupTakenAt:evidence.backupTakenAt,restoredAt:evidence.restoredAt,measuredRecoveryMinutes:evidence.measuredRecoveryMinutes,approvedTargetMinutes:evidence.approvedTargetMinutes,withinTarget},signatureDigest:createHash('sha256').update(signature).digest('hex'),invalidated}},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'recovery:resumption-authorized',recordType:'recovery-fences',outcome:'success',safeChanges:{reasonCode:withinTarget?'within-target':'target-exceeded',count:invalidated.accounts}})
  return {generation:evidence.generation,previousGeneration:current,operator:evidence.operator,issuedAt:at,stages,withinTarget}
 })
}
