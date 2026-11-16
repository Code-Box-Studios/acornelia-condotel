import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {DirectBookingPolicy} from '@/domain/bookings/direct-policy'
import {privateDigest} from '@/domain/security/private-state'
export const offlineReceiptSchema=z.object({method:z.enum(['cash','bank-transfer']),receiptReference:z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9:/._ -]*$/).transform(value=>value.toUpperCase()),evidenceReference:z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/),amount:z.object({minor:z.string().regex(/^[1-9]\d*$/).max(60),currency:z.literal('PHP')}).strict(),receivedAt:z.iso.datetime({offset:true}).transform(value=>new Date(value).toISOString()).optional()}).strict()
export const offlineCollectionSchema=offlineReceiptSchema.extend({bookingId:z.uuid(),expectedRevision:z.number().int().positive()}).strict()
export type ParsedOfflineReceipt=z.infer<typeof offlineReceiptSchema>
export function offlineReceiptId(input:Pick<ParsedOfflineReceipt,'method'|'receiptReference'>){return 'OFFLINE-'+privateDigest(input.method+'\0'+input.receiptReference)}
export function validateOfflineReceipt(ctx:CommandContext,input:ParsedOfflineReceipt,policy:DirectBookingPolicy){
  if(!policy.methods.includes(input.method)||input.amount.currency!==policy.currency||BigInt(input.amount.minor)>BigInt(policy.maxAmountMinor))throw new Error('Offline collection method or amount is unavailable')
  const received=Date.parse(input.receivedAt??ctx.clock.now()),now=Date.parse(ctx.clock.now())
  if(received>now+policy.futureToleranceSeconds*1000||received<now-policy.maxBackdateDays*86400000)throw new Error('Receipt time needs authorized review')
}
