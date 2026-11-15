import type {CommandContext} from '@/domain/db/types'
import {assertVerifiedDelivery,type VerifiedDelivery} from '@/integrations/maya/signature'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {sqlError} from '@/domain/bookings/validation'
export async function ingestMayaDelivery(ctx:CommandContext,delivery:VerifiedDelivery):Promise<string>{
  if(ctx.actor.kind!=='system'||ctx.actor.purpose!=='payments')throw new Error('Payment ingestion authority required')
  assertVerifiedDelivery(delivery)
  for(let attempt=0;attempt<4;attempt++){
    try{return await ctx.uow.run(ctx.actor,async tx=>{
      const existing=(await tx.payload.find({collection:'payment-inbox',where:{semanticKey:{equals:delivery.semanticKey}},req:tx.req,overrideAccess:false,depth:0,limit:1})).docs[0]
      if(existing)return existing.id
      const facts=delivery.payment
      const inbox=await tx.payload.create({collection:'payment-inbox',data:{semanticKey:delivery.semanticKey,deliveryKey:delivery.deliveryKey,providerPaymentId:facts.id,merchantReference:facts.reference,environment:facts.environment,amountMinor:facts.amount.minor,currency:facts.amount.currency,providerStatus:facts.status,method:facts.method,providerPaidAt:facts.paidAt,receivedAt:delivery.receivedAt,source:'webhook',state:'pending'},req:tx.req,overrideAccess:false})
      await enqueue(tx,{semanticKey:'payment-observation:'+inbox.id,kind:'payment-observation',payload:{inboxId:inbox.id},availableAt:ctx.clock.now()})
      await appendAudit(tx,{action:'payment:received',recordType:'payment-inbox',recordId:inbox.id,outcome:'success',safeChanges:{source:'maya-webhook'}})
      return inbox.id
    })}catch(error){const sql=sqlError(error);if(attempt<3&&sql.code==='23505'&&sql.constraint==='payment_inbox_semantic_key_idx')continue;throw error}
  }
  throw new Error('Payment delivery conflict')
}
