import type {CommandContext} from '@/domain/db/types'
import type {WorkHandlers,WorkKind} from '@/domain/work/types'
import {workKinds,type WorkResult} from '@/domain/work/types'
import {assertWorker,repeatable,workPolicy} from '@/domain/work/validation'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import {z} from 'zod'
// Transports register only after their operation ownership and timeout rules pass their own tests.
export const configuredWorkHandlers:WorkHandlers={}
export async function runWorkBatch(ctx:CommandContext,handlers:WorkHandlers,options:{maxJobs?:number;kind?:WorkKind}={}):Promise<{claimed:number;completed:number;uncertain:number;failed:number}>{
  assertWorker(ctx)
  const policy=await workPolicy(ctx),maxJobs=Math.min(z.number().int().positive().max(100).parse(options.maxJobs??policy.maxBatch),policy.maxBatch)
  const kinds=options.kind?[z.enum(workKinds).parse(options.kind)]:workKinds.filter(kind=>handlers[kind])
  if(!kinds.length||kinds.some(kind=>!handlers[kind]))throw new Error('Work transport is not configured')
  const stats={claimed:0,completed:0,uncertain:0,failed:0},started=performance.now()
  for(let n=0;n<maxJobs&&performance.now()-started<policy.runSeconds*1000;n++){
    let lease=null
    for(const kind of kinds){lease=await claimWork(ctx,kind);if(lease)break}
    if(!lease)break
    stats.claimed++
    const handler=handlers[lease.kind]!
    let result:WorkResult,dispatched=false
    try{
      const before=await handler.preflight?.(ctx,lease)
      if(before)result=before
      else{
        await beginWork(ctx,lease)
        assertWorker(ctx)
        dispatched=true
        const controller=new AbortController(),timeout=Math.min(policy.runSeconds*1000-(performance.now()-started),(policy.leaseSeconds-1)*1000)
        let timer:ReturnType<typeof setTimeout>|undefined
        try{
          result=await Promise.race([handler.execute(ctx,lease,controller.signal),new Promise<WorkResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({state:'uncertain',reason:'timeout'})},Math.max(1,timeout))})])
        }finally{if(timer)clearTimeout(timer)}
      }
    }catch{result={state:dispatched?'uncertain':'retry',reason:'unexpected'}}
    await completeWork(ctx,lease,result)
    const state=dispatched&&!repeatable(lease.kind)&&result.state!=='done'&&!(result.definitelyNotSent&&['email','enquiry'].includes(lease.kind))?'uncertain':result.state==='retry'&&lease.attempts>=policy.maxAttempts?'failed':result.state
    if(state==='done')stats.completed++
    if(state==='uncertain')stats.uncertain++
    if(state==='failed')stats.failed++
  }
  return stats
}
