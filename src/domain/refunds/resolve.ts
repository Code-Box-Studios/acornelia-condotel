import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {RefundOperation} from '@/payload-types'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {refundStaff,requireRefundPolicy} from './policy'
export type UncertainResolution={refundId:string;providerRefundId:string;evidenceReference:string}
const schema=z.object({refundId:z.uuid(),providerRefundId:z.uuid(),evidenceReference:z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/)}).strict()
/**
 * Settles an uncertain app request against one merchant-imported provider refund after independent review.
 * Equal money alone never correlates automatically; this records a reviewer's decision so the money counts once.
 */
export async function resolveUncertainRefund(ctx:CommandContext,input:UncertainResolution):Promise<RefundOperation>{
 refundStaff(ctx);const value=schema.parse(input),reviewer=ctx.actor.kind==='staff'?ctx.actor.id:''
 return ctx.uow.run(ctx.actor,async tx=>{
  const rule=await requireRefundPolicy(tx,ctx)
  if(rule.manualResolution!=='independent-provider-review')throw new Error('Manual refund resolution is unavailable')
  const operation=await tx.payload.findByID({collection:'refund-operations',id:value.refundId,depth:0,req:tx.req,overrideAccess:false}),provider=await tx.payload.findByID({collection:'refund-operations',id:value.providerRefundId,depth:0,req:tx.req,overrideAccess:false})
  if(operation.origin!=='app'||operation.state!=='uncertain'||operation.method==='offline')throw new Error('Only an uncertain provider request can be resolved')
  if(relationshipId(operation.authorizedStaff)===reviewer)throw new Error('An independent reviewer is required')
  if(provider.origin!=='provider'||provider.state!=='completed'||relationshipId(provider.payment)!==relationshipId(operation.payment)||provider.actualAmountMinor!==operation.amountMinor||provider.actualCurrency!==operation.currency||provider.method!==operation.method)throw new Error('The provider refund does not exactly match this request')
  const claimed=await tx.payload.count({collection:'refund-operations',where:{settledByRefund:{equals:provider.id}},req:tx.req,overrideAccess:false})
  if(claimed.totalDocs)throw new Error('The provider refund already settles another request')
  const now=ctx.clock.now(),settled=await tx.payload.update({collection:'refund-operations',id:operation.id,data:{state:'satisfied',settledByRefund:provider.id,reviewerStaff:reviewer,observedAt:now,reasonCode:'reviewed-provider-identity',resultProof:{version:1,source:'staff-reviewed-identity',settledBy:provider.id,providerOperationId:provider.providerOperationId,evidenceReference:value.evidenceReference}},req:tx.req,overrideAccess:false})
  const issue=(await tx.payload.find({collection:'payment-issues',where:{and:[{issueKey:{equals:'refund-operation:'+operation.id+':outcome-uncertain'}},{state:{equals:'open'}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(issue)await tx.payload.update({collection:'payment-issues',id:issue.id,data:{state:'resolved',resolvedAt:now,resolutionCode:'refund-identity-reviewed'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'refund:identity-resolved',recordType:'refund-operations',recordId:operation.id,outcome:'success',safeChanges:{amountMinor:operation.amountMinor,currency:operation.currency}})
  return settled
 })
}
