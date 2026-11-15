import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'
import type {Payload} from 'payload'
import type {PolicyVersion} from '@/payload-types'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {PolicySnapshot} from './types'
import {parseRuntimePolicy} from './parse'
const unconfigured=():PolicySnapshot=>({id:'unconfigured',revision:0,approvedSections:[],sections:{}})
export function policyFromRecord(row:PolicyVersion):PolicySnapshot{
  if(!row.approved||!row.approvalReference?.trim())throw new Error('Policy requires documented approval')
  return parseRuntimePolicy({id:row.id,revision:row.revision,approvedSections:row.approvedSections,sections:row.sections,synthetic:row.synthetic},[])
}
export async function resolveCurrentPolicy(payload:Payload):Promise<PolicySnapshot>{
  const result=await payload.find({collection:'policy-versions',where:{and:[{active:{equals:true}},{approved:{equals:true}}]},limit:2,depth:0,overrideAccess:true})
  if(result.docs.length!==1)return unconfigured()
  try{return policyFromRecord(result.docs[0])}catch{return unconfigured()}
}
export async function requireCurrentPolicy(tx:DbTx,ctx:CommandContext,sections:string[]):Promise<PolicySnapshot>{
  z.uuid().parse(ctx.policy.id)
  const row=(await tx.payload.find({collection:'policy-versions',where:{and:[{id:{equals:ctx.policy.id}},{active:{equals:true}},{approved:{equals:true}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!row)throw new Error('Approved policy changed; request a new quote')
  const saved=policyFromRecord(row),comparable=(policy:PolicySnapshot)=>({...policy,synthetic:!!policy.synthetic,approvedSections:[...policy.approvedSections].sort()})
  if(!isDeepStrictEqual(comparable(saved),comparable(ctx.policy)))throw new Error('Policy context does not match the approved version')
  return parseRuntimePolicy(saved,sections)
}
