import {randomBytes} from 'node:crypto'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {MayaGateway} from '@/integrations/maya/types'
import {appendAudit} from '@/domain/audit/append'
import {endAccountAccess} from '@/features/auth/revocation'
import {reconcileAttempt} from '@/domain/payments/reconcile'
import {reconcilePaymentRefunds} from '@/domain/refunds/reconcile'
import {fenceFrom} from '@/config/operation-mode'
import {markMailWorkFailure} from '@/email/work-state'
const nonRepeatable=['create-checkout','refund','email','enquiry'],mail=['email','enquiry']
const random=()=>randomBytes(48).toString('base64url')
async function all<T extends 'customers'|'staff-users'|'auth-tokens'|'booking-claims'|'booking-views'|'work-items'>(tx:DbTx,collection:T,where:object){
 const rows=await tx.payload.find({collection,where:where as never,limit:10000,depth:0,req:tx.req,overrideAccess:true})
 if(rows.hasNextPage)throw new Error('Too many records for one recovery batch; split the procedure')
 return rows.docs
}
/**
 * A restored database cannot prove which passwords, links or sessions are still valid, so none
 * are trusted: every account gets a random password and a new security revision, and every
 * outstanding token, claim and private link is revoked. Unsent outbound work becomes uncertain
 * so it is reconciled or deliberately replayed instead of repeating an external effect.
 */
export async function invalidateRestoredCapabilities(tx:DbTx,at:string){
 const counts={accounts:0,tokens:0,claims:0,links:0,work:0}
 for(const collection of ['customers','staff-users'] as const)for(const row of await all(tx,collection,{}))
  {await endAccountAccess(tx,collection,row.id,{password:random()});counts.accounts++}
 for(const row of await all(tx,'auth-tokens',{usedAt:{exists:false}})){await tx.payload.update({collection:'auth-tokens',id:row.id,data:{usedAt:at},req:tx.req,overrideAccess:true});counts.tokens++}
 for(const row of await all(tx,'booking-claims',{and:[{usedAt:{exists:false}},{revokedAt:{exists:false}}]})){await tx.payload.update({collection:'booking-claims',id:row.id,data:{revokedAt:at},req:tx.req,overrideAccess:true});counts.claims++}
 for(const row of await all(tx,'booking-views',{revokedAt:{exists:false}})){await tx.payload.update({collection:'booking-views',id:row.id,data:{revokedAt:at},req:tx.req,overrideAccess:true});counts.links++}
 for(const row of await all(tx,'work-items',{state:{in:['ready','leased']}})){
  if(!nonRepeatable.includes(row.kind)){await tx.payload.update({collection:'work-items',id:row.id,data:{state:'ready',leaseOwner:null,leaseExpires:null,dispatchStarted:null},req:tx.req,overrideAccess:true});continue}
  // Money work needs provider reconciliation; messages may already have gone out, so a developer replays them deliberately.
  const state=mail.includes(row.kind)?'failed' as const:'uncertain' as const
  await tx.payload.update({collection:'work-items',id:row.id,data:{state,leaseOwner:null,leaseExpires:null,lastError:'restored-before-reconciliation'},req:tx.req,overrideAccess:true})
  if(state==='failed')await markMailWorkFailure(tx,row,state)
  counts.work++
 }
 await appendAudit(tx,{action:'recovery:capabilities-invalidated',recordType:'recovery-fences',outcome:'success',safeChanges:{count:counts.accounts+counts.tokens+counts.claims+counts.links+counts.work}})
 return counts
}
export type ReconciliationReport={attempts:number;payments:number;unresolved:number}
/**
 * Reconcile stage: read provider state for open checkout attempts and every merchant collection,
 * applying only merchant-verified evidence. No checkout, refund, void or email is sent.
 */
export async function reconcileRestoredState(ctx:CommandContext,gateway:MayaGateway):Promise<ReconciliationReport>{
 if(ctx.actor.kind!=='system'||ctx.actor.purpose!=='recovery'||fenceFrom(process.env,null).mode!=='reconcile')throw new Error('Run reconciliation as the recovery operator in reconcile mode')
 const readOnly:MayaGateway={...gateway,createCheckout:async()=>({kind:'refused',reason:'configuration'}),refundPayment:async()=>({kind:'refused',reason:'configuration'}),voidPayment:async()=>({kind:'refused',reason:'configuration'})}
 const open=await ctx.uow.run(ctx.actor,async tx=>({attempts:(await tx.payload.find({collection:'payment-attempts',where:{state:{in:['preparing','ready','unknown','pending']}},limit:5000,depth:0,req:tx.req,overrideAccess:true})).docs.map(row=>row.id),payments:(await tx.payload.find({collection:'payment-transactions',where:{and:[{status:{equals:'collected'}},{environment:{not_equals:'offline'}}]},limit:5000,depth:0,req:tx.req,overrideAccess:true})).docs.map(row=>row.id)}))
 let unresolved=0
 for(const id of open.attempts){try{const result=await reconcileAttempt(ctx,id,readOnly);if(!['confirmed','closed'].includes(result.state))unresolved++}catch{unresolved++}}
 for(const id of open.payments){try{if((await reconcilePaymentRefunds(ctx,id,readOnly)).state!=='reconciled')unresolved++}catch{unresolved++}}
 return {attempts:open.attempts.length,payments:open.payments.length,unresolved}
}
