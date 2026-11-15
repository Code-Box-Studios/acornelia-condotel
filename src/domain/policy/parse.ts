import { z } from 'zod'
import type { PolicySnapshot } from './types'
const fields={id:z.string().min(1),revision:z.number().int().positive(),approvedSections:z.array(z.string().min(1)),sections:z.record(z.string(),z.unknown())}
const policySchema=z.object({...fields,synthetic:z.literal(false).optional()})
function requireSections(policy:PolicySnapshot,requiredSections:string[]):PolicySnapshot{
  for(const section of requiredSections)if(!policy.approvedSections.includes(section)||policy.sections[section]===undefined)throw new Error(`Policy section requires approval: ${section}`)
  return policy
}
export function parseApprovedPolicy(input:unknown,requiredSections:string[]):PolicySnapshot{return requireSections(policySchema.parse(input),requiredSections)}
export function parseRuntimePolicy(input:unknown,requiredSections:string[]):PolicySnapshot{
  const fixtures=process.env.APP_ENV==='test'||process.env.APP_ENV==='development'&&process.env.DEVELOPMENT_FIXTURES==='true'
  return fixtures?requireSections(z.object({...fields,synthetic:z.boolean().optional()}).parse(input),requiredSections):parseApprovedPolicy(input,requiredSections)
}
