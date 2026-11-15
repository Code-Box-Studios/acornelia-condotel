import {z} from 'zod'
import {isDeepStrictEqual} from 'node:util'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Quote} from '@/payload-types'
import {matchesPrivateDigest} from '@/domain/security/private-state'
import {relationshipId,requireCustomer} from '@/features/customer/bookings'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {calculatePrice,rateRulesSchema} from './calculate'
import type {QuoteSnapshot,AcceptedQuote} from './types'
export const quoteRequestSchema=z.object({stay:z.object({roomTypeId:z.uuid(),arrival:z.string(),departure:z.string(),occupancy:z.object({adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100)}).strict()}).strict()}).strict()
export const pricingPolicySchema=z.object({currency:z.literal('PHP'),quoteMinutes:z.number().int().min(1).max(60),zeroTotal:z.enum(['unavailable','confirm-without-payment'])}).strict()
const money=z.object({minor:z.string().regex(/^(0|[1-9]\d*)$/).max(60),currency:z.literal('PHP')}).strict()
const snapshotSchema=z.object({version:z.number().int().positive(),stay:quoteRequestSchema.shape.stay,roomType:z.object({id:z.uuid(),name:z.string().max(200)}).strict(),policyVersionId:z.uuid(),policyRevision:z.number().int().positive(),rateVersionId:z.uuid(),offerVersionId:z.uuid().nullable(),issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),synthetic:z.boolean(),components:z.array(z.object({kind:z.enum(['night','extra-adult','child','discount','fee','tax']),label:z.string().max(160),date:z.string().optional(),amount:money}).strict()).max(500),subtotal:money,discount:money,fees:money,taxes:money,total:money}).strict()
export async function quoteIdentity(tx:DbTx,ctx:CommandContext,row?:Quote){
  if(!ctx.browserKey||!/^[A-Za-z0-9_-]{43}$/.test(ctx.browserKey))throw new Error('Quote browser access required')
  if(ctx.actor.kind==='system'||ctx.actor.kind==='staff'&&ctx.actor.role!=='developer')throw new Error('Quote access denied')
  if(ctx.actor.kind==='customer')await requireCustomer(tx)
  if(row&&(!matchesPrivateDigest('quote-browser\0'+ctx.browserKey,row.browserHash)||relationshipId(row.issuerCustomer)&&(ctx.actor.kind!=='customer'||relationshipId(row.issuerCustomer)!==ctx.actor.id)))throw new Error('Quote is unavailable')
}
export function quoteSnapshot(row:Quote):QuoteSnapshot{
  const snapshot=snapshotSchema.parse(row.snapshot)
  if(snapshot.version!==row.version||snapshot.total.minor!==row.amountMinor||snapshot.total.currency!==row.currency||snapshot.policyVersionId!==relationshipId(row.policyVersion)||snapshot.rateVersionId!==relationshipId(row.rateVersion))throw new Error('Quote context failed validation')
  return {...snapshot,id:row.id}
}
export function acceptedQuote(row:Quote):AcceptedQuote{
  if(!row.acceptedAt)throw new Error('Quote agreement is required')
  const snapshot=quoteSnapshot(row),policySnapshot=parseRuntimePolicy(row.policySnapshot,['stay','pricing']),rateSnapshot=rateRulesSchema.parse(row.rateSnapshot)
  const expected=calculatePrice(snapshot.stay,rateSnapshot,snapshot.discount)
  for(const field of ['components','subtotal','discount','fees','taxes','total'] as const)if(!isDeepStrictEqual(snapshot[field],expected[field]))throw new Error('Accepted quote failed calculation verification')
  if(policySnapshot.id!==snapshot.policyVersionId||policySnapshot.revision!==snapshot.policyRevision)throw new Error('Accepted policy mismatch')
  return {...snapshot,acceptedAt:row.acceptedAt,policySnapshot,rateSnapshot}
}
export function toPublicQuote(quote:QuoteSnapshot|AcceptedQuote):QuoteSnapshot{return z.object({...snapshotSchema.shape,id:z.uuid()}).parse(quote)}
