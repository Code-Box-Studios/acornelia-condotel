import {z} from 'zod'
import type {Where} from 'payload'
import type {CommandContext} from '../db/types'
import type {AuditFilter,AuditPage} from './types'
import {authorize} from '@/features/auth/authorization'
import {appendAudit} from './append'
const schema=z.object({limit:z.number().int().min(1).max(100).default(50),cursor:z.string().optional(),action:z.string().regex(/^[a-z0-9:_-]{1,120}$/).optional(),recordType:z.string().regex(/^[a-z0-9_-]{1,80}$/).optional()}).strict()
export async function readAudit(ctx:CommandContext,filter:AuditFilter):Promise<AuditPage>{
  authorize(ctx.actor,'audit:read',{kind:'audit'})
  const parsed=schema.parse(filter)
  const where:Where[]=[]
  if(parsed.action)where.push({action:{equals:parsed.action}})
  if(parsed.recordType)where.push({recordType:{equals:parsed.recordType}})
  if(parsed.cursor){
    const cursor=z.object({time:z.iso.datetime(),id:z.uuid()}).parse(JSON.parse(Buffer.from(parsed.cursor,'base64url').toString()))
    where.push({or:[{createdAt:{less_than:cursor.time}},{and:[{createdAt:{equals:cursor.time}},{id:{less_than:cursor.id}}]}]})
  }
  return ctx.uow.run(ctx.actor,async tx=>{
    const result=await tx.payload.find({collection:'audit-entries',where:where.length?{and:where}:{},limit:parsed.limit,sort:['-createdAt','-id'],depth:0,req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'audit:read',recordType:'audit-entries',outcome:'success'})
    const last=result.docs.at(-1)
    return {items:result.docs,nextCursor:result.hasNextPage&&last?Buffer.from(JSON.stringify({time:last.createdAt,id:last.id})).toString('base64url'):null}
  })
}
