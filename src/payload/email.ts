import {createLocalReq,type PayloadEmailAdapter,type PayloadRequest} from 'payload'
import {z} from 'zod'
import {trustCommand} from './access/internal'
import {parseEnvironment} from '@/config/env'
import {policyFromRecord} from '@/domain/policy/current'
import {emailPolicy} from '@/email/policy'
import {createEmail} from '@/email/storage'
import {opaqueSecret,privateDigest} from '@/domain/security/private-state'
import {enqueue} from '@/domain/work/enqueue'
// Payload caches hooks across bundles. These short-lived receipts contain no reset token.
const registry=globalThis as typeof globalThis&{__acorneliaQueuedEmailV1?:Map<string,{recipient:string;expires:number}>}
const receipts=registry.__acorneliaQueuedEmailV1??=new Map<string,{recipient:string;expires:number}>()
function receipt(recipient:string){
  for(const [key,value] of receipts)if(value.expires<Date.now())receipts.delete(key)
  if(receipts.size>=1000)throw new Error('Email queue is busy')
  const marker='acornelia-queued:'+opaqueSecret();receipts.set(marker,{recipient,expires:Date.now()+60000});return marker
}
/** Native authentication never sends inside its database transaction. Only our queue hook can acknowledge mail. */
export const durablePayloadEmailAdapter:PayloadEmailAdapter=()=>({name:'durable-outbox',defaultFromAddress:'noreply@acornelia.invalid',defaultFromName:'Acornelia',sendEmail:async message=>{
  const marker=typeof message.html==='string'?message.html:'',value=receipts.get(marker);receipts.delete(marker)
  if(!value||value.expires<Date.now()||message.to!==value.recipient||message.cc||message.bcc)throw new Error('Email requires a durable transactional intent')
  return {queued:true}
}})
export async function queueStaffResetEmail(args?:{req?:PayloadRequest;token?:string;user?:{id?:string;email?:string}}):Promise<string>{
  const req=args?.req,token=z.string().regex(/^[a-f0-9]{40}$/).parse(args?.token),id=z.uuid().parse(args?.user?.id)
  if(!req?.transactionID||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Staff recovery is unavailable')
  const actor={kind:'system' as const,purpose:'email' as const},commandReq=await createLocalReq({req:{...req}},req.payload);commandReq.user=null;trustCommand(commandReq,actor)
  const tx={payload:req.payload,req:commandReq,actor},staff=await req.payload.findByID({collection:'staff-users',id,showHiddenFields:true,depth:0,req:commandReq,overrideAccess:true})
  const policies=(await req.payload.find({collection:'policy-versions',where:{and:[{active:{equals:true}},{approved:{equals:true}}]},limit:2,depth:0,req:commandReq,overrideAccess:false})).docs
  if(policies.length!==1)throw new Error('Staff recovery requires approved email configuration')
  emailPolicy(policyFromRecord(policies[0]))
  if(!staff.deactivated){
    const expiresAt=z.iso.datetime({offset:true}).parse(staff.resetPasswordExpiration),row=await createEmail(tx,{semanticKey:'staff-reset:'+privateDigest(token),category:'staff-reset',snapshot:{staffId:staff.id,token,recipient:staff.email,name:staff.name},expiresAt})
    await enqueue(tx,{semanticKey:'staff-reset:'+row.id,kind:'email',payload:{category:'staff',messageId:row.id},availableAt:new Date().toISOString()})
  }
  return receipt(staff.email)
}
