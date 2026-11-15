import {createHash} from 'node:crypto'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {assertVerifiedDelivery,type VerifiedDelivery} from '@/integrations/maya/signature'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {sqlError} from '@/domain/bookings/validation'
export async function ingestMayaDeliveryTx(tx:DbTx,delivery:VerifiedDelivery,now:string):Promise<string>{
  if(tx.actor.kind!=='system'||!['payments','work','recovery'].includes(tx.actor.purpose))throw new Error('Payment ingestion authority required')
  assertVerifiedDelivery(delivery)
  // Preserve immutable provenance. A platform notification cannot shadow merchant-read evidence.
  const semanticKey=delivery.source==='retrieval'?createHash('sha256').update('merchant-retrieval\0'+delivery.semanticKey).digest('hex'):delivery.semanticKey
  const existing=(await tx.payload.find({collection:'payment-inbox',where:{semanticKey:{equals:semanticKey}},req:tx.req,overrideAccess:false,depth:0,limit:1})).docs[0]
  if(existing)return existing.id
  const facts=delivery.payment
  const inbox=await tx.payload.create({collection:'payment-inbox',data:{semanticKey,deliveryKey:delivery.deliveryKey,providerPaymentId:facts.id,merchantReference:facts.reference,environment:facts.environment,amountMinor:facts.amount.minor,currency:facts.amount.currency,providerStatus:facts.status,method:facts.method,providerPaidAt:facts.paidAt,receivedAt:delivery.receivedAt,source:delivery.source,state:'pending'},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'payment-observation:'+inbox.id,kind:'payment-observation',payload:{inboxId:inbox.id},availableAt:now})
  await appendAudit(tx,{action:'payment:received',recordType:'payment-inbox',recordId:inbox.id,outcome:'success',safeChanges:{source:'maya-'+delivery.source}})
  return inbox.id
}
export async function ingestMayaDelivery(ctx:CommandContext,delivery:VerifiedDelivery):Promise<string>{
  if(ctx.actor.kind!=='system'||ctx.actor.purpose!=='payments')throw new Error('Payment ingestion authority required')
  assertVerifiedDelivery(delivery)
  for(let attempt=0;attempt<4;attempt++){
    try{return await ctx.uow.run(ctx.actor,tx=>ingestMayaDeliveryTx(tx,delivery,ctx.clock.now()))}catch(error){const sql=sqlError(error);if(attempt<3&&sql.code==='23505'&&sql.constraint==='payment_inbox_semantic_key_idx')continue;throw error}
  }
  throw new Error('Payment delivery conflict')
}
