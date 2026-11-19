import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {RefundOperation} from '@/payload-types'
import {appendAudit} from '@/domain/audit/append'
import {refundStaff,requireRefundPolicy} from './policy'
const schema=z.object({refundId:z.uuid(),reason:z.string().trim().regex(/^[a-z0-9-]{1,60}$/)}).strict()
/**
 * Releases a reservation that never reached the provider: an app request still at dispatch
 * generation 0, or an offline reimbursement with no pending or confirmed payout record.
 */
export async function withdrawRefund(ctx:CommandContext,input:{refundId:string;reason:string}):Promise<RefundOperation>{
 refundStaff(ctx);const value=schema.parse(input)
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireRefundPolicy(tx,ctx)
  const operation=await tx.payload.findByID({collection:'refund-operations',id:value.refundId,depth:0,req:tx.req,overrideAccess:false})
  if(operation.origin!=='app'||operation.state!=='authorized'||operation.dispatchGeneration!==0)throw new Error('Only an unsent refund request can be withdrawn')
  if(operation.method==='offline'){
   const evidence=await tx.payload.count({collection:'refund-evidence',where:{and:[{operation:{equals:operation.id}},{source:{equals:'staff-attested'}},{state:{equals:'pending'}}]},req:tx.req,overrideAccess:false})
   if(evidence.totalDocs)throw new Error('Review the recorded payout before withdrawing this reimbursement')
  }else{
   const work=(await tx.payload.find({collection:'work-items',where:{semanticKey:{equals:'refund:'+operation.id}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
   // Generation 0 proves no request was sent; only a live lease could still move it to generation 1.
   if(work&&work.state==='leased'&&work.leaseExpires&&Date.parse(work.leaseExpires)>Date.parse(ctx.clock.now()))throw new Error('This refund is being sent; wait for its outcome')
   if(work&&work.state==='ready')await tx.payload.update({collection:'work-items',id:work.id,data:{state:'done',lastError:'withdrawn-before-dispatch'},req:tx.req,overrideAccess:false})
  }
  const withdrawn=await tx.payload.update({collection:'refund-operations',id:operation.id,data:{state:'cancelled',reasonCode:'withdrawn',resultProof:{version:1,source:'staff-withdrawn',reason:value.reason}},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'refund:withdrawn',recordType:'refund-operations',recordId:operation.id,outcome:'success',safeChanges:{reasonCode:value.reason,amountMinor:operation.amountMinor,currency:operation.currency}})
  return withdrawn
 })
}
