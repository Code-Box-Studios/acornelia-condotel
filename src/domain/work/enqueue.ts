import type {DbTx} from '@/domain/db/types'
import type {WorkIntent} from './types'
import {intentSchema,payloadFor,workFingerprint} from './validation'
export async function enqueue(tx:DbTx,input:WorkIntent):Promise<string>{
  if(tx.req.transactionID===undefined||tx.req.transactionID===null)throw new Error('Work intent requires its mutation transaction')
  const intent=intentSchema.parse(input),payload=payloadFor(intent.kind,intent.payload),fingerprint=workFingerprint(intent.kind,payload)
  const existing=(await tx.payload.find({collection:'work-items',where:{semanticKey:{equals:intent.semanticKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(existing){if(workFingerprint(existing.kind,existing.payload)!==fingerprint)throw new Error('Work semantic key conflicts with its original intent');return existing.id}
  const row=await tx.payload.create({collection:'work-items',data:{...intent,payload,fingerprint,state:'ready',generation:0,attempts:0},req:tx.req,overrideAccess:false})
  return row.id
}
