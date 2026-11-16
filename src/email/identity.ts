import type {DbTx} from '@/domain/db/types'
import type {WorkItem} from '@/payload-types'
export async function mailForWork(tx:DbTx,work:Pick<WorkItem,'kind'|'payload'>){
  const value=work.payload as {category?:string;bookingId?:string;revision?:number;messageId?:string;enquiryId?:string;issueId?:string}
  if(work.kind==='email'&&value.category==='staff'&&value.messageId)return (await tx.payload.find({collection:'email-messages',where:{id:{equals:value.messageId}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]??null
  const key=work.kind==='enquiry'?'enquiry:'+value.enquiryId:value.category==='booking'?'booking-confirmation:'+value.bookingId+':'+value.revision:value.category==='auth'?'auth-delivery:'+value.messageId:value.category==='payment-issue'?'payment-issue:'+value.issueId:null
  return key?(await tx.payload.find({collection:'email-messages',where:{semanticKey:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]??null:null
}
