import {z} from 'zod'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import type {PolicySnapshot} from '@/domain/policy/types'
export const recoveryPolicySchema=z.object({intervalSeconds:z.number().int().min(5).max(3600),maxChecks:z.number().int().min(1).max(1000),escalateAfterDeadlineMinutes:z.number().int().min(1).max(1440),maxBrowserResumes:z.number().int().min(0).max(10),maxOpenHolds:z.number().int().min(1).max(20),maxNewHolds:z.number().int().min(1).max(100),holdWindowMinutes:z.number().int().min(5).max(1440),providerWindowMinutes:z.number().int().min(1).max(240),windowVerificationReference:z.string().trim().min(1).max(240),terminalRelease:z.enum(['immediate','at-deadline'])}).strict()
export type RecoveryPolicy=z.infer<typeof recoveryPolicySchema>
export function recoveryPolicy(policy:PolicySnapshot):RecoveryPolicy{return recoveryPolicySchema.parse(parseRuntimePolicy(policy,['paymentRecovery']).sections.paymentRecovery)}
