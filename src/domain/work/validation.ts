import {createHash,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import type {DbTx,CommandContext} from '@/domain/db/types'
import {parseEnvironment} from '@/config/env'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {requireCurrentPolicy} from '@/domain/policy/current'
import type {WorkItem} from '@/payload-types'
import {workKinds,type WorkKind,type WorkLease,type WorkPayload} from './types'
const id=z.uuid(),instant=z.iso.datetime({offset:true})
const attempt=z.object({attemptId:id}).strict(),booking=z.object({bookingId:id}).strict(),refund=z.object({refundId:id}).strict()
const email=z.discriminatedUnion('category',[
  z.object({category:z.literal('auth'),messageId:id}).strict(),
  z.object({category:z.literal('booking'),bookingId:id,revision:z.number().int().positive()}).strict(),
  z.object({category:z.literal('staff'),messageId:id}).strict(),
])
export const workPolicySchema=z.object({leaseSeconds:z.number().int().min(5).max(300),maxAttempts:z.number().int().min(1).max(20),maxBatch:z.number().int().min(1).max(100),backoffSeconds:z.array(z.number().int().min(1).max(86400)).min(1).max(20),runSeconds:z.number().int().min(1).max(240)}).strict()
export function payloadFor(kind:WorkKind,input:unknown):WorkPayload{
  return ({'payment-observation':z.object({inboxId:id}).strict(),'create-checkout':attempt,'reconcile-payment':attempt,'reconcile-refund':refund,'expire-hold':booking,email,refund,enquiry:z.object({enquiryId:id}).strict()}[kind]).parse(input)
}
export const intentSchema=z.object({semanticKey:z.string().regex(/^[A-Za-z0-9:_-]{1,180}$/),kind:z.enum(workKinds),payload:z.unknown(),availableAt:instant}).strict()
export function workFingerprint(kind:WorkKind,payload:unknown){return createHash('sha256').update(JSON.stringify({kind,payload:payloadFor(kind,payload)})).digest('hex')}
export function ownerDigest(owner:string){return createHash('sha256').update(owner).digest('hex')}
export function assertWorkMode(){if(parseEnvironment(process.env).operationMode!=='normal')throw new Error('Work is quarantined')}
export function assertWorker(ctx:CommandContext){assertWorkMode();if(ctx.actor.kind!=='system'||ctx.actor.purpose!=='work')throw new Error('Work runner authority required')}
export async function workPolicy(ctx:CommandContext,tx?:DbTx){
  assertWorkMode()
  const parsed=parseRuntimePolicy(ctx.policy,['work'])
  if(!parsed.synthetic&&tx)await requireCurrentPolicy(tx,ctx,['work'])
  return workPolicySchema.parse(parsed.sections.work)
}
export function repeatable(kind:WorkKind){return ['payment-observation','reconcile-payment','reconcile-refund','expire-hold'].includes(kind)}
export async function fencedRow(tx:DbTx,lease:WorkLease,now:string):Promise<WorkItem>{
  id.parse(lease.id)
  const row=await tx.payload.findByID({collection:'work-items',id:lease.id,req:tx.req,overrideAccess:false,depth:0})
  const expected=ownerDigest(lease.owner),actual=row.leaseOwner||''
  if(row.state!=='leased'||row.generation!==lease.generation||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected))||!row.leaseExpires||Date.parse(row.leaseExpires)<=Date.parse(now)||row.kind!==lease.kind||workFingerprint(row.kind,row.payload)!==workFingerprint(lease.kind,lease.payload))throw new Error('Work lease is stale')
  return row
}
