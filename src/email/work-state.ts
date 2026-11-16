import type {DbTx} from '@/domain/db/types'
import type {WorkItem} from '@/payload-types'
import {appendAudit} from '@/domain/audit/append'
import {mailForWork} from './identity'
import {relationshipId} from '@/features/customer/bookings'
/** A lost worker cannot leave its message looking safely pending after possible SMTP acceptance. */
export async function markMailWorkFailure(tx:DbTx,work:Pick<WorkItem,'kind'|'payload'>,state:'uncertain'|'failed'){
  if(!['email','enquiry'].includes(work.kind))return
  const row=await mailForWork(tx,work);if(!row||row.state!=='pending')return
  await tx.payload.update({collection:'email-messages',id:row.id,data:{state,reason:state==='uncertain'?'transport':row.reason??'temporary'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'email:work-failed',recordType:'email-messages',recordId:row.id,outcome:state==='uncertain'?'unknown':'failed',safeChanges:{state}})
}
/** Called only inside the developer's explicit replay transaction for known failed work. */
export async function prepareMailReplay(tx:DbTx,work:Pick<WorkItem,'kind'|'payload'>){
  if(!['email','enquiry'].includes(work.kind))return
  const row=await mailForWork(tx,work);if(!row)return
  if(row.state==='uncertain'||row.state==='accepted')throw new Error('Mail outcome must be reconciled before replay')
  if(row.state!=='failed')return
  await tx.payload.update({collection:'email-messages',id:row.id,data:{state:'pending',reason:null},req:tx.req,overrideAccess:false})
  if(row.authDelivery)await tx.payload.update({collection:'auth-deliveries',id:relationshipId(row.authDelivery)!,data:{state:'pending'},req:tx.req,overrideAccess:false})
  if(row.enquiry)await tx.payload.update({collection:'enquiries',id:relationshipId(row.enquiry)!,data:{state:'delivery-pending'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'email:retry-authorized',recordType:'email-messages',recordId:row.id,outcome:'success'})
}
