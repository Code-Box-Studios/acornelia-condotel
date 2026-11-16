import {markMailWorkFailure} from '@/email/work-state'
import type {CommandContext} from '@/domain/db/types'
import type {WorkKind,WorkLease} from './types'
import {randomBytes} from 'node:crypto'
import {appendAudit} from '@/domain/audit/append'
import {assertWorker,fencedRow,ownerDigest,payloadFor,repeatable,workFingerprint,workPolicy} from './validation'
export async function claimWork(ctx:CommandContext,kind:WorkKind):Promise<WorkLease|null>{
  assertWorker(ctx)
  return ctx.uow.run(ctx.actor,async tx=>{
    const policy=await workPolicy(ctx,tx),now=ctx.clock.now()
    const rows=(await tx.payload.find({collection:'work-items',where:{and:[{kind:{equals:kind}},{or:[{and:[{state:{equals:'ready'}},{availableAt:{less_than_equal:now}}]},{and:[{state:{equals:'leased'}},{leaseExpires:{less_than_equal:now}}]}]}]},sort:['availableAt','id'],limit:policy.maxBatch,depth:0,req:tx.req,overrideAccess:false})).docs
    for(const row of rows){
      const unsafe=row.state==='leased'&&!!row.dispatchStarted&&!repeatable(kind)
      let payload,fingerprint
      try{payload=payloadFor(kind,row.payload);fingerprint=workFingerprint(kind,payload)}catch{/* Retain malformed legacy work for operator review. */}
      if(unsafe||row.attempts>=policy.maxAttempts||!payload){
        const state=unsafe?'uncertain':'failed',reason=unsafe?'lease-expired-after-dispatch':!payload?'invalid-work':'attempts-exhausted'
        await tx.payload.update({collection:'work-items',id:row.id,data:{state,lastError:reason,leaseOwner:null,leaseExpires:null},req:tx.req,overrideAccess:false})
        await markMailWorkFailure(tx,row,state)
        await appendAudit(tx,{action:'work:escalated',recordType:'work-items',recordId:row.id,outcome:unsafe?'unknown':'failed',safeChanges:{state,reasonCode:reason}})
        continue
      }
      const owner=randomBytes(32).toString('hex'),expiresAt=new Date(Date.parse(now)+policy.leaseSeconds*1000).toISOString()
      const updated=await tx.payload.update({collection:'work-items',id:row.id,data:{state:'leased',generation:row.generation+1,attempts:row.attempts+1,leaseOwner:ownerDigest(owner),leaseExpires:expiresAt,dispatchStarted:null,lastError:null,fingerprint},req:tx.req,overrideAccess:false})
      return {id:row.id,kind,payload,generation:updated.generation,attempts:updated.attempts,owner,expiresAt}
    }
    return null
  })
}
export async function beginWork(ctx:CommandContext,lease:WorkLease):Promise<void>{
  assertWorker(ctx)
  await ctx.uow.run(ctx.actor,async tx=>{
    await workPolicy(ctx,tx)
    const row=await fencedRow(tx,lease,ctx.clock.now())
    if(row.dispatchStarted)throw new Error('Work dispatch has already started')
    await tx.payload.update({collection:'work-items',id:row.id,data:{dispatchStarted:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'work:dispatch-started',recordType:'work-items',recordId:row.id,outcome:'success'})
  })
}
