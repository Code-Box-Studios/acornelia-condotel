import type {CommandContext} from '@/domain/db/types'
import type {WorkLease,WorkResult} from './types'
import {z} from 'zod'
import {appendAudit} from '@/domain/audit/append'
import {assertWorker,assertWorkMode,fencedRow,repeatable,workPolicy} from './validation'
const resultSchema=z.object({state:z.enum(['done','retry','uncertain','failed']),reason:z.enum(['retryable','timeout','provider-unavailable','transport-unconfigured','invalid-work','unexpected','lease-expired-after-dispatch','attempts-exhausted']).optional()})
export async function completeWork(ctx:CommandContext,lease:WorkLease,result:WorkResult):Promise<void>{
  assertWorker(ctx)
  const parsed=resultSchema.parse(result)
  await ctx.uow.run(ctx.actor,async tx=>{
    const policy=await workPolicy(ctx,tx),now=ctx.clock.now(),row=await fencedRow(tx,lease,now)
    const unsafe=!!row.dispatchStarted&&!repeatable(row.kind)&&parsed.state!=='done'
    const state=unsafe?'uncertain':parsed.state==='retry'?(row.attempts>=policy.maxAttempts?'failed':'ready'):parsed.state
    // Verify the fence before any canonical booking/payment/message effects.
    if(result.apply)await result.apply(tx)
    const delay=policy.backoffSeconds[Math.min(row.attempts-1,policy.backoffSeconds.length-1)]
    await tx.payload.update({collection:'work-items',id:row.id,data:{state,leaseOwner:null,leaseExpires:null,lastError:state==='done'?null:parsed.reason||'unexpected',...(state==='ready'?{availableAt:new Date(Date.parse(now)+delay*1000).toISOString(),dispatchStarted:null}:{})},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'work:completed',recordType:'work-items',recordId:row.id,outcome:state==='done'?'success':state==='uncertain'?'unknown':'failed',safeChanges:{state,...(parsed.reason?{reasonCode:parsed.reason}:{})}})
  })
}
function operator(ctx:CommandContext){assertWorkMode();if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer')throw new Error('Developer work authority required')}
export async function replayWork(ctx:CommandContext,id:string):Promise<void>{
  operator(ctx);z.uuid().parse(id)
  await ctx.uow.run(ctx.actor,async tx=>{
    await workPolicy(ctx,tx)
    const row=await tx.payload.findByID({collection:'work-items',id,depth:0,req:tx.req,overrideAccess:false})
    if(!['failed','uncertain'].includes(row.state)||row.state==='uncertain'&&!repeatable(row.kind))throw new Error('Work requires outcome reconciliation before replay')
    await tx.payload.update({collection:'work-items',id,data:{state:'ready',attempts:0,generation:row.generation+1,dispatchStarted:null,leaseOwner:null,leaseExpires:null,lastError:null,availableAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'work:replayed',recordType:'work-items',recordId:id,outcome:'success'})
  })
}
export async function listFailedWork(ctx:CommandContext){
  operator(ctx)
  return ctx.uow.run(ctx.actor,async tx=>{
    const result=await tx.payload.find({collection:'work-items',where:{state:{in:['failed','uncertain']}},sort:['-updatedAt','id'],limit:100,depth:0,req:tx.req,overrideAccess:false})
    return {items:result.docs.map(row=>({id:row.id,kind:row.kind,state:row.state,attempts:row.attempts,reason:row.lastError})),hasMore:result.hasNextPage}
  })
}
