import {z} from 'zod'
import {nightsBetween,parsePropertyDate} from '@/domain/shared/dates'
const minor=z.string().regex(/^(0|[1-9]\d*)$/).max(38),positive=z.string().regex(/^[1-9]\d*$/).max(38)
export const releaseReasonSchema=z.enum(['failed','expired-unpaid','cancelled','refunded','reissue'])
export const offerTermsSchema=z.object({
  accountScope:z.literal('all-customers'),currency:z.literal('PHP'),roomScope:z.enum(['all','selected']),roomTypeIds:z.array(z.uuid()).max(1000),
  bookingFrom:z.iso.datetime(),bookingUntil:z.iso.datetime(),stayFrom:z.string(),stayUntil:z.string(),
  minimumSpend:z.object({minor,currency:z.literal('PHP')}).strict(),minimumSpendBasis:z.enum(['eligible-charges','subtotal']),eligibleComponents:z.array(z.enum(['night','extra-adult','child'])).min(1).max(3),
  benefit:z.discriminatedUnion('kind',[z.object({kind:z.literal('fixed'),minor:positive}).strict(),z.object({kind:z.literal('percent'),bps:z.number().int().min(1).max(10000)}).strict()]),
  capMinor:positive.nullable(),overDiscount:z.enum(['cap','reject']),overallLimit:z.number().int().min(1).max(1000000000).nullable(),perAccountLimit:z.number().int().min(1).max(1000000000).nullable(),limitScope:z.enum(['offer','version']),stacking:z.literal('single-offer'),expiryHandling:z.literal('reserve-before-window-end'),rounding:z.literal('half-up'),usage:z.record(releaseReasonSchema,z.enum(['release','retain'])),
}).strict().superRefine((terms,ctx)=>{
  if(Date.parse(terms.bookingUntil)<=Date.parse(terms.bookingFrom))ctx.addIssue({code:'custom',message:'Offer booking window must be positive'})
  try{parsePropertyDate(terms.stayFrom);parsePropertyDate(terms.stayUntil);nightsBetween(terms.stayFrom,terms.stayUntil)}catch{ctx.addIssue({code:'custom',message:'Offer stay window must use valid property dates'})}
  if(terms.roomScope==='all'&&terms.roomTypeIds.length||terms.roomScope==='selected'&&!terms.roomTypeIds.length)ctx.addIssue({code:'custom',message:'Room scope must be explicit'})
  if(new Set(terms.roomTypeIds).size!==terms.roomTypeIds.length||new Set(terms.eligibleComponents).size!==terms.eligibleComponents.length)ctx.addIssue({code:'custom',message:'Duplicate offer scope'})
})
export const offerPolicySchema=z.object({enabled:z.literal(true),accountScope:z.literal('all-customers'),discountOrder:z.literal('before-fees-and-tax')}).strict()
