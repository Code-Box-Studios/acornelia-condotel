import {createLocalReq,type CollectionConfig,type CollectionAfterChangeHook,type GlobalConfig,type AfterErrorHook} from 'payload'
import {appendAudit,auditSnapshot} from '@/domain/audit/append'
import {eventActor,recordEvent,recordRefusedAttempt} from '@/domain/audit/events'
import {commandActor,trustCommand} from '../access/internal'
const changed:CollectionAfterChangeHook=async({doc,previousDoc,operation,req,collection})=>{
  const actor=eventActor(req)
  if(actor.kind!=='staff')return doc
  if(req.transactionID===undefined)throw new Error('Staff writes require atomic audit storage')
  const auditReq=await createLocalReq({user:req.user??undefined,req:{...req}},req.payload)
  trustCommand(auditReq,actor)
  const before=previousDoc||{}
  const fieldsChanged=Object.keys(doc).filter(key=>!['id','createdAt','updatedAt'].includes(key)&&JSON.stringify(before[key])!==JSON.stringify(doc[key]))
  await appendAudit({payload:req.payload,req:auditReq,actor},{action:`${collection.slug}:${operation}`,recordType:collection.slug,recordId:String(doc.id),outcome:'success',safeChanges:{before:auditSnapshot(before),after:auditSnapshot(doc),fieldsChanged}})
  return doc
}
async function authEvent(req:Parameters<CollectionAfterChangeHook>[0]['req'],action:string){
  const actor=eventActor(req)
  if(actor.kind!=='staff')return
  const auditReq=await createLocalReq({user:req.user??undefined,req:{...req}},req.payload)
  trustCommand(auditReq,actor)
  await appendAudit({payload:req.payload,req:auditReq,actor},{action,recordType:'staff-users',recordId:actor.id,outcome:'success'})
}
export function withStaffAudit(collection:CollectionConfig):CollectionConfig{
  const existing=collection.hooks||{}
  const sensitive=new Set(['audit-entries','bookings','staff-users','customers','payment-attempts','payment-transactions'])
  return {...collection,hooks:{...existing,
    ...(collection.slug!=='audit-entries'?{afterChange:[...(existing.afterChange||[]),changed],afterDelete:[...(existing.afterDelete||[]),async({doc,req})=>{
      const actor=eventActor(req)
      if(actor.kind==='staff'){
        const auditReq=await createLocalReq({user:req.user??undefined,req:{...req}},req.payload)
        trustCommand(auditReq,actor)
        await appendAudit({payload:req.payload,req:auditReq,actor},{action:`${collection.slug}:delete`,recordType:collection.slug,recordId:String(doc.id),outcome:'success',safeChanges:{before:auditSnapshot(doc)}})
      }
      return doc
    }]}:{}),
    ...(collection.slug==='staff-users'?{
      afterLogin:[...(existing.afterLogin||[]),async({req})=>{await authEvent(req,'staff:login')}],
      afterLogout:[...(existing.afterLogout||[]),async({req})=>{await authEvent(req,'staff:logout')}],
    }:{}),
    ...(sensitive.has(collection.slug)?{afterOperation:[...(existing.afterOperation||[]),async args=>{
      if(['find','findByID','count'].includes(args.operation)&&!commandActor(args.req)){
        const actor=eventActor(args.req)
        if(actor.kind==='staff')await recordEvent(args.req.payload,actor,{action:`${collection.slug}:read`,recordType:collection.slug,outcome:'success'})
      }
      return args.result
    }]}:{}),
  }}
}
export const failedOperation:AfterErrorHook=async({req,collection,error})=>{
  const status=(error as {status?:number}).status||500
  await recordRefusedAttempt(req.payload,eventActor(req),{action:'request:failed',recordType:collection?.slug||'api',outcome:[401,403].includes(status)?'refused':'failed',safeChanges:{reasonCode:`http-${status}`}})
}

export function withGlobalStaffAudit(global:GlobalConfig):GlobalConfig{
  return {...global,hooks:{...global.hooks,afterChange:[...(global.hooks?.afterChange||[]),async({doc,previousDoc,req})=>{
    const actor=eventActor(req)
    if(actor.kind!=='staff')return doc
    if(req.transactionID===undefined)throw new Error('Global edits require atomic audit storage')
    const auditReq=await createLocalReq({user:req.user??undefined,req:{...req}},req.payload)
    trustCommand(auditReq,actor)
    await appendAudit({payload:req.payload,req:auditReq,actor},{action:`${global.slug}:update`,recordType:global.slug,outcome:'success',safeChanges:{before:auditSnapshot(previousDoc||{}),after:auditSnapshot(doc),fieldsChanged:Object.keys(doc).filter(key=>!['id','createdAt','updatedAt','globalType'].includes(key)&&JSON.stringify(previousDoc?.[key])!==JSON.stringify(doc[key]))}})
    return doc
  }]}}
}
