import {z} from 'zod'
import type {DbTx} from '../db/types'
import type {AuditInput} from './types'
const fields=new Set(['before','after','fieldsChanged','label','title','role','status','state','revision','onSale','deactivated','arrival','departure','room','roomId','booking','bookingId','amountMinor','currency','discountMinor','totalMinor','nightlyMinor','offerVersionId','policyVersionId','_status','publishedAt','eventDate','validFrom','validUntil','capacity','maxGuests','valueMinor','percentBps','reasonCode','source','requestId'])
function safeChanges(input:Record<string,unknown>,depth=0):Record<string,unknown>{
  if(depth>2)throw new Error('Unsafe audit nesting')
  const output:Record<string,unknown>={}
  for(const [key,value] of Object.entries(input)){
    if(!fields.has(key))throw new Error('Unsafe audit field')
    if(key==='before'||key==='after'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid audit snapshot')
      output[key]=safeChanges(value as Record<string,unknown>,depth+1)
    }else if(key==='fieldsChanged'){
      output[key]=z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/)).max(100).parse(value)
    }else if(typeof value==='string')output[key]=value.replace(/https?:\/\/\S+/g,'[link]').slice(0,240)
    else if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))output[key]=value
    else throw new Error('Unsafe audit value')
  }
  return output
}
const schema=z.object({action:z.string().regex(/^[a-z0-9:_-]{1,120}$/),recordType:z.string().regex(/^[a-z0-9_-]{1,80}$/),recordId:z.string().max(120).optional(),outcome:z.enum(['success','refused','failed','unknown']),safeChanges:z.record(z.string(),z.unknown()).optional()}).strict()
const principalSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('anonymous')}).strict(),
  z.object({kind:z.literal('system'),purpose:z.enum(['payments','work','email','recovery'])}).strict(),
  z.object({kind:z.literal('customer'),collection:z.literal('customers'),id:z.uuid()}).strict(),
  z.object({kind:z.literal('staff'),collection:z.literal('staff-users'),id:z.uuid(),role:z.enum(['staff','developer'])}).strict(),
])
export function validateAuditRecord(input:Record<string,unknown>){
  const parsed=schema.parse({action:input.action,recordType:input.recordType,recordId:input.recordId,outcome:input.outcome,safeChanges:input.safeChanges})
  return {...parsed,actor:principalSchema.parse(input.actor),...(parsed.safeChanges?{safeChanges:safeChanges(parsed.safeChanges)}:{})}
}
export async function appendAudit(tx:DbTx,entry:AuditInput):Promise<string>{
  const parsed=validateAuditRecord({...entry,actor:tx.actor})
  if(tx.req.transactionID===undefined||tx.req.transactionID===null)throw new Error('Audit write requires the mutation transaction')
  const created=await tx.payload.create({collection:'audit-entries',data:parsed,req:tx.req,overrideAccess:false})
  return created.id
}
export function auditSnapshot(doc:Record<string,unknown>):Record<string,unknown>{
  const result:Record<string,unknown>={}
  for(const [key,value] of Object.entries(doc)){
    if(!fields.has(key)||['before','after','fieldsChanged'].includes(key))continue
    if(value===null||['string','number','boolean'].includes(typeof value))result[key]=value
    else if(value&&typeof value==='object'&&'id' in value&&typeof value.id==='string')result[key]=value.id
  }
  return result
}
