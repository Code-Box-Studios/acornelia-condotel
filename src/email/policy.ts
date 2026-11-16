import {z} from 'zod'
import type {PolicySnapshot} from '@/domain/policy/types'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {CONFIRMATION_CC} from './templates'
export const emailPolicySchema=z.object({transport:z.literal('brevo-smtp'),sender:z.object({address:z.email().max(254),name:z.string().trim().min(1).max(120),verificationReference:z.string().trim().min(1).max(240)}).strict(),confirmationCc:z.literal(CONFIRMATION_CC),bookingViewMinutes:z.number().int().min(1).max(10080),dailyRecipients:z.number().int().min(1).max(10000),quotaTimezone:z.literal('UTC'),timeoutMs:z.number().int().min(100).max(60000),enquiryTo:z.array(z.email()).min(1).max(10),issueTo:z.array(z.email()).min(1).max(10),claimDelivery:z.enum(['disabled','reviewed-account'])}).strict()
export function emailPolicy(snapshot:PolicySnapshot){return emailPolicySchema.parse(parseRuntimePolicy(snapshot,['transactionalEmail']).sections.transactionalEmail)}
export type EmailPolicy=z.infer<typeof emailPolicySchema>
