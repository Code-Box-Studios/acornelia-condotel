import {z} from 'zod'
import type {CommandContext} from '../db/types'
import {parseRuntimePolicy} from '../policy/parse'
const policySchema=z.object({method:z.literal('staff-reviewed-original-evidence'),tokenMinutes:z.number().int().min(1).max(60)}).strict()
export function claimPolicy(ctx:CommandContext){
  const policy=parseRuntimePolicy(ctx.policy,['historical-claims'])
  if(!policy.approvedSections.includes('historical-claims')||policy.revision<1)throw new Error('Historical claims require an approved evidence policy')
  return policySchema.parse(policy.sections['historical-claims'])
}
