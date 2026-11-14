import type {PolicySnapshot} from '@/domain/policy/types'
export function syntheticPolicy(overrides:Partial<PolicySnapshot>={}):PolicySnapshot{
  return {id:'synthetic-isolated-test-policy',revision:1,synthetic:true,approvedSections:[],sections:{},...overrides}
}
