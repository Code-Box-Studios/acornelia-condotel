import { z } from 'zod'
import type { PolicySnapshot } from './types'
const policySchema=z.object({id:z.string().min(1),revision:z.number().int().positive(),approvedSections:z.array(z.string().min(1)),sections:z.record(z.string(),z.unknown()),synthetic:z.literal(false).optional()})
export function parseApprovedPolicy(input: unknown, requiredSections: string[]): PolicySnapshot {
  const policy=policySchema.parse(input)
  for(const section of requiredSections){
    if(!policy.approvedSections.includes(section) || policy.sections[section]===undefined) throw new Error(`Policy section requires approval: ${section}`)
  }
  return policy
}
