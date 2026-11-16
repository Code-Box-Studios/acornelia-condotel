import {z} from 'zod'
import {createHmac} from 'node:crypto'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {EmailMessage,WorkItem} from '@/payload-types'
import type {WorkHandler,WorkLease,WorkResult} from '@/domain/work/types'
import type {DeliveryResult,TransactionalMailer,TransactionalMessage} from './types'
import {assertWorker,fencedRow} from '@/domain/work/validation'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {relationshipId} from '@/features/customer/bookings'
import {createBookingView} from '@/features/booking/view-access'
import {encryptPrivateState,decryptPrivateState,privateDigest,matchesPrivateDigest} from '@/domain/security/private-state'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {parseEnvironment} from '@/config/env'
import {emailPolicy,type EmailPolicy} from './policy'
import {bookingSnapshotSchema,createEmail,readMailSnapshot} from './storage'
import {mailForWork} from './identity'
import {authMessage,bookingConfirmation,operationalMessage,privateBookingMessage,staffResetMessage,claimMessage} from './templates'
import {configuredMailer,messageSchema} from './transport'
const authSnapshot=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),recipient:z.email(),name:z.string(),purpose:z.enum(['verify','reset'])}).strict()
const staffSnapshot=z.object({staffId:z.uuid(),token:z.string().regex(/^[a-f0-9]{40}$/),recipient:z.email(),name:z.string()}).strict()
const claimSnapshot=z.object({approvalId:z.uuid(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),recipient:z.email()}).strict()
async function rowFor(tx:DbTx,ctx:CommandContext,work:WorkItem):Promise<EmailMessage>{
  const previous=await mailForWork(tx,work);if(previous)return previous
  const value=work.payload as {category?:string;messageId?:string;enquiryId?:string;issueId?:string}
  if(work.kind==='email'&&value.category==='auth'&&value.messageId){
    const source=await tx.payload.findByID({collection:'auth-deliveries',id:value.messageId,depth:0,req:tx.req,overrideAccess:false})
    const snapshot=authSnapshot.parse(decryptPrivateState(source.encryptedState,'auth-delivery:'+source.id))
    return createEmail(tx,{semanticKey:'auth-delivery:'+source.id,category:'auth',snapshot,authDelivery:source.id,expiresAt:source.expiresAt})
  }
  if(work.kind==='enquiry'&&value.enquiryId){
    const enquiry=await tx.payload.findByID({collection:'enquiries',id:value.enquiryId,depth:0,req:tx.req,overrideAccess:false})
    return createEmail(tx,{semanticKey:'enquiry:'+enquiry.id,category:'enquiry',snapshot:{reference:enquiry.reference,contact:enquiry.contact,post:enquiry.postSnapshot},enquiry:enquiry.id})
  }
  if(work.kind==='email'&&value.category==='payment-issue'&&value.issueId){
    const issue=await tx.payload.findByID({collection:'payment-issues',id:value.issueId,depth:0,req:tx.req,overrideAccess:false})
    return createEmail(tx,{semanticKey:'payment-issue:'+issue.id,category:'payment-issue',snapshot:{issueId:issue.id,reason:issue.reasonCode},issue:issue.id})
  }
  throw new Error('Missing original frozen email intent')
}
async function eligible(tx:DbTx,ctx:CommandContext,row:EmailMessage,settings:EmailPolicy):Promise<boolean>{
  if(row.expiresAt&&Date.parse(row.expiresAt)<=Date.parse(ctx.clock.now()))return false
  if(row.category==='booking'){
    const booking=await tx.payload.findByID({collection:'bookings',id:relationshipId(row.booking)!,depth:0,req:tx.req,overrideAccess:false})
    if(!['confirmed','checked-in','completed'].includes(booking.status)||booking.revision!==row.revision)return false
  }
  if(row.category==='booking-view'){
    const snapshot=z.object({message:messageSchema,viewId:z.uuid()}).strict().parse(readMailSnapshot(row)),view=await tx.payload.findByID({collection:'booking-views',id:snapshot.viewId,depth:0,req:tx.req,overrideAccess:false})
    return view.purpose==='booking-view'&&!view.revokedAt&&Date.parse(view.expiresAt)>Date.parse(ctx.clock.now())&&relationshipId(view.booking)===relationshipId(row.booking)
  }
  if(row.category==='auth'){
    const source=await tx.payload.findByID({collection:'auth-deliveries',id:relationshipId(row.authDelivery)!,depth:0,req:tx.req,overrideAccess:false}),grant=await tx.payload.findByID({collection:'auth-tokens',id:relationshipId(source.tokenRef)!,depth:0,req:tx.req,overrideAccess:false}),account=await tx.payload.findByID({collection:'customers',id:relationshipId(source.account)!,depth:0,req:tx.req,overrideAccess:true}),snapshot=authSnapshot.parse(readMailSnapshot(row))
    const emailHash=createHmac('sha256',process.env.PAYLOAD_SECRET!).update('auth-email\0'+account.email).digest('hex')
    return source.state==='pending'&&!grant.usedAt&&Date.parse(grant.expiresAt)>Date.parse(ctx.clock.now())&&matchesPrivateDigest(snapshot.token,grant.tokenHash)&&grant.purpose===snapshot.purpose&&relationshipId(grant.account)===account.id&&grant.securityRevision===account.securityRevision&&grant.emailHash===emailHash&&!account.deactivated&&account.email===snapshot.recipient&&(snapshot.purpose==='verify'?!account._verified:!!account._verified)
  }
  if(row.category==='staff-reset'){
    const snapshot=staffSnapshot.parse(readMailSnapshot(row)),staff=await tx.payload.findByID({collection:'staff-users',id:snapshot.staffId,showHiddenFields:true,depth:0,req:tx.req,overrideAccess:true})
    return !staff.deactivated&&staff.email===snapshot.recipient&&!!staff.resetPasswordToken&&matchesPrivateDigest(snapshot.token,privateDigest(staff.resetPasswordToken))&&!!staff.resetPasswordExpiration&&Date.parse(staff.resetPasswordExpiration)>Date.parse(ctx.clock.now())
  }
  if(row.category==='claim'){
    if(settings.claimDelivery!=='reviewed-account')return false
    const snapshot=claimSnapshot.parse(readMailSnapshot(row)),grant=await tx.payload.findByID({collection:'booking-claims',id:snapshot.approvalId,depth:0,req:tx.req,overrideAccess:false}),account=await tx.payload.findByID({collection:'customers',id:relationshipId(grant.customer)!,depth:0,req:tx.req,overrideAccess:true})
    return !grant.usedAt&&!grant.revokedAt&&grant.policyId===ctx.policy.id&&grant.policyRevision===ctx.policy.revision&&Date.parse(grant.expiresAt)>Date.parse(ctx.clock.now())&&matchesPrivateDigest('booking-claim\0'+snapshot.token,grant.tokenHash)&&grant.securityRevision===account.securityRevision&&!account.deactivated&&!!account._verified&&account.email===snapshot.recipient
  }
  return true
}
async function render(tx:DbTx,ctx:CommandContext,row:EmailMessage,settings:EmailPolicy):Promise<TransactionalMessage>{
  const snapshot=readMailSnapshot(row),origin=parseEnvironment(process.env).appUrl,sender={address:settings.sender.address,name:settings.sender.name}
  if(row.category==='booking'){
    const saved=bookingSnapshotSchema.parse(snapshot),expiresAt=new Date(Date.parse(ctx.clock.now())+settings.bookingViewMinutes*60000).toISOString(),view=await createBookingView(tx,relationshipId(row.booking)!,expiresAt),url=new URL('/booking/view',origin)
    url.hash=new URLSearchParams({id:view.id,bookingId:view.bookingId,token:view.token}).toString()
    const child=await createEmail(tx,{semanticKey:'booking-private-view:'+row.id,category:'booking-view',snapshot:{message:privateBookingMessage(saved,sender,url.href),viewId:view.id},booking:relationshipId(row.booking)!,revision:row.revision??undefined,expiresAt})
    await enqueue(tx,{semanticKey:'booking-private-view:'+row.id,kind:'email',payload:{category:'staff',messageId:child.id},availableAt:ctx.clock.now()})
    return bookingConfirmation(saved,sender)
  }
  if(row.category==='booking-view')return messageSchema.parse(z.object({message:messageSchema,viewId:z.uuid()}).strict().parse(snapshot).message)
  if(row.category==='auth')return authMessage(authSnapshot.parse(snapshot),sender,origin)
  if(row.category==='staff-reset')return staffResetMessage(staffSnapshot.parse(snapshot),sender,origin)
  if(row.category==='claim')return claimMessage(claimSnapshot.parse(snapshot),sender,origin)
  if(row.category==='enquiry'){
    const value=z.object({reference:z.string(),contact:z.object({name:z.string(),email:z.email(),phone:z.string().optional(),message:z.string()}).passthrough(),post:z.unknown().optional()}).strict().parse(snapshot)
    return operationalMessage('enquiry',sender,settings.enquiryTo,'Acornelia enquiry '+value.reference,['Enquiry '+value.reference,'From '+value.contact.name+' ('+value.contact.email+').',...(value.contact.phone?['Phone: '+value.contact.phone]:[]),value.contact.message,'Read the enquiry in the authorized staff workspace. This email does not reserve a room or confirm an event.'])
  }
  const value=z.object({issueId:z.uuid(),reason:z.string()}).strict().parse(snapshot)
  return operationalMessage('payment-issue',sender,settings.issueTo,'Acornelia payment needs review',['Issue '+value.issueId,'Reason: '+value.reason,'Review current evidence in the authorized staff workspace. Do not create another payment or refund from this email alone.'])
}
function quotaKey(day:string){return privateDigest('email-quota\0'+day)}
async function reserveQuota(tx:DbTx,ctx:CommandContext,row:EmailMessage,message:TransactionalMessage,settings:EmailPolicy):Promise<boolean>{
  const day=ctx.clock.now().slice(0,10)
  if(row.reservedDay===day)return true
  if(row.reservedDay)await releaseQuota(tx,row,day)
  const key=quotaKey(day),counter=(await tx.payload.find({collection:'auth-throttles',where:{key:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0],recipients=new Set([...message.to,...message.cc].map(value=>value.toLowerCase())).size
  if((counter?.count??0)+recipients>settings.dailyRecipients)return false
  if(counter)await tx.payload.update({collection:'auth-throttles',id:counter.id,data:{count:counter.count+recipients},req:tx.req,overrideAccess:false})
  else await tx.payload.create({collection:'auth-throttles',data:{key,count:recipients,expiresAt:new Date(Date.parse(day+'T00:00:00Z')+172800000).toISOString()},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'email-messages',id:row.id,data:{reservedDay:day,recipientCount:recipients},req:tx.req,overrideAccess:false})
  return true
}
async function releaseQuota(tx:DbTx,row:EmailMessage,today:string){
  if(!row.reservedDay)return
  const counter=(await tx.payload.find({collection:'auth-throttles',where:{key:{equals:quotaKey(row.reservedDay)}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!counter&&row.reservedDay>=today||counter&&counter.count<(row.recipientCount??0))throw new Error('Email quota reservation is inconsistent')
  if(counter)await tx.payload.update({collection:'auth-throttles',id:counter.id,data:{count:counter.count-(row.recipientCount??0)},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'email-messages',id:row.id,data:{reservedDay:null,recipientCount:null},req:tx.req,overrideAccess:false})
}
async function cancel(tx:DbTx,ctx:CommandContext,row:EmailMessage){
  const reason=row.expiresAt&&Date.parse(row.expiresAt)<=Date.parse(ctx.clock.now())?'expired' as const:'obsolete' as const
  await releaseQuota(tx,row,ctx.clock.now().slice(0,10))
  await tx.payload.update({collection:'email-messages',id:row.id,data:{state:'cancelled',reason},req:tx.req,overrideAccess:false})
  if(row.authDelivery)await tx.payload.update({collection:'auth-deliveries',id:relationshipId(row.authDelivery)!,data:{state:'cancelled'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'email:cancelled',recordType:'email-messages',recordId:row.id,outcome:'refused',safeChanges:{reasonCode:reason}})
}
async function preflight(ctx:CommandContext,lease:WorkLease):Promise<WorkResult|null>{
  assertWorker(ctx)
  for(let retry=0;;retry++)try{return await ctx.uow.run(ctx.actor,async tx=>{
    const work=await fencedRow(tx,lease,ctx.clock.now()),settings=emailPolicy(await requireCurrentPolicy(tx,ctx,['work','transactionalEmail']))
    if(!['email','enquiry'].includes(work.kind)||work.dispatchStarted)throw new Error('Invalid mail work')
    let row=await rowFor(tx,ctx,work)
    if(row.state!=='pending')return {state:'done'}
    if(!await eligible(tx,ctx,row,settings)){await cancel(tx,ctx,row);return {state:'done'}}
    const message=row.encryptedMessage?messageSchema.parse(decryptPrivateState(row.encryptedMessage,'mail-message:'+row.id)):{...await render(tx,ctx,row,settings),id:row.id}
    if(!row.encryptedMessage)row=await tx.payload.update({collection:'email-messages',id:row.id,data:{encryptedMessage:encryptPrivateState(message,'mail-message:'+row.id)},req:tx.req,overrideAccess:false})
    if(!await reserveQuota(tx,ctx,row,message,settings)){
      await tx.payload.update({collection:'email-messages',id:row.id,data:{reason:'quota'},req:tx.req,overrideAccess:false})
      return {state:'retry',reason:'retryable'}
    }
    return null
  })}catch(error){const validation=error as {name?:string;data?:{errors?:{path?:string}[]}};if(retry<3&&validation.name==='ValidationError'&&validation.data?.errors?.some(field=>['key','semanticKey'].includes(field.path??'')))continue;throw error}
}
/** Read/send only; the handler applies the outcome through completeWork's live fence. */
export async function deliverEmail(ctx:CommandContext,lease:WorkLease,mailer?:TransactionalMailer,signal?:AbortSignal):Promise<DeliveryResult>{
  assertWorker(ctx)
  const message=await ctx.uow.run(ctx.actor,async tx=>{
    const work=await fencedRow(tx,lease,ctx.clock.now()),settings=emailPolicy(await requireCurrentPolicy(tx,ctx,['work','transactionalEmail'])),row=await mailForWork(tx,work)
    if(!work.dispatchStarted||!row||row.state!=='pending'||!row.reservedDay||!row.encryptedMessage||!await eligible(tx,ctx,row,settings))throw new Error('Email no longer owns dispatch')
    if(row.reservedDay!==ctx.clock.now().slice(0,10))return null
    const value=messageSchema.parse(decryptPrivateState(row.encryptedMessage,'mail-message:'+row.id))
    if(value.from.address!==settings.sender.address||value.from.name!==settings.sender.name)throw new Error('Frozen sender needs an approved recovery decision')
    return value
  })
  if(!message)return {kind:'refused',reason:'temporary'}
  assertWorker(ctx)
  const transport=mailer??configuredMailer(ctx.policy);if(!transport)throw new Error('Email transport is not configured')
  return transport.send(message,signal)
}
export function emailHandler(mailer:TransactionalMailer):WorkHandler{return {preflight,execute:async(ctx,lease,signal)=>{
  const outcome=await deliverEmail(ctx,lease,mailer,signal)
  return {state:outcome.kind==='accepted'?'done':outcome.kind==='refused'?(outcome.reason==='temporary'?'retry':'failed'):'uncertain',...(outcome.kind==='refused'?{definitelyNotSent:true as const}:{}),...(outcome.kind!=='accepted'?{reason:outcome.kind==='unknown'&&outcome.reason==='timeout'?'timeout' as const:'provider-unavailable' as const}:{}),apply:async tx=>{
    const row=await mailForWork(tx,lease);if(!row||row.state!=='pending')throw new Error('Email outcome lost its intent')
    if(outcome.kind==='refused')await releaseQuota(tx,row,ctx.clock.now().slice(0,10))
    const state=outcome.kind==='accepted'?'accepted':outcome.kind==='unknown'?'uncertain':outcome.reason==='permanent'?'failed':'pending'
    await tx.payload.update({collection:'email-messages',id:row.id,data:{state,reason:outcome.kind==='accepted'?null:outcome.reason,...(outcome.kind==='accepted'?{providerMessageId:outcome.providerMessageId,acceptedAt:ctx.clock.now()}:{})},req:tx.req,overrideAccess:false})
    if(row.authDelivery&&(state==='failed'||state==='accepted'))await tx.payload.update({collection:'auth-deliveries',id:relationshipId(row.authDelivery)!,data:{state:state==='accepted'?'delivered':'failed'},req:tx.req,overrideAccess:false})
    if(row.enquiry)await tx.payload.update({collection:'enquiries',id:relationshipId(row.enquiry)!,data:{state:state==='accepted'?'delivered':state==='failed'?'delivery-failed':'delivery-pending'},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'email:outcome',recordType:'email-messages',recordId:row.id,outcome:state==='accepted'?'success':state==='uncertain'?'unknown':'failed',safeChanges:{state,...(outcome.kind!=='accepted'?{reasonCode:outcome.reason}:{})}})
  }}
}}}
