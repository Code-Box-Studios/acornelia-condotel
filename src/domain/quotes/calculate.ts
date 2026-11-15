import {z} from 'zod'
import type {Money} from '@/domain/shared/types'
import {parseMoney} from '@/domain/shared/money'
import {nightsBetween,parsePropertyDate} from '@/domain/shared/dates'
import type {StayRequest} from '@/domain/inventory/types'
import type {RateRules,PriceBreakdown,QuoteComponent} from './types'
const minor=z.string().regex(/^(0|[1-9]\d*)$/).max(38)
export const rateRulesSchema=z.object({
  currency:z.literal('PHP'),nightMinor:minor,weekendDays:z.array(z.number().int().min(0).max(6)).max(7),weekendNightMinor:minor.nullable(),
  specialNights:z.array(z.object({date:z.string(),minor}).strict()).max(1000),
  includedAdults:z.number().int().min(1).max(100),extraAdultNightMinor:minor,childNightMinor:minor,
  fees:z.array(z.object({label:z.string().trim().min(1).max(80),kind:z.enum(['fixed','per-night','percent']),value:minor}).strict()).max(30),
  taxes:z.array(z.object({label:z.string().trim().min(1).max(80),bps:z.number().int().min(0).max(1000000)}).strict()).max(30),
  taxBasis:z.enum(['room-after-discount','room-and-fees-after-discount']),rounding:z.literal('half-up-per-line'),
}).strict().superRefine((rules,ctx)=>{
  if(new Set(rules.weekendDays).size!==rules.weekendDays.length)ctx.addIssue({code:'custom',message:'Duplicate weekend day'})
  if(new Set(rules.specialNights.map(night=>night.date)).size!==rules.specialNights.length)ctx.addIssue({code:'custom',message:'Duplicate special-night rate'})
  for(const night of rules.specialNights){try{parsePropertyDate(night.date)}catch{ctx.addIssue({code:'custom',message:'Invalid special-night calendar date'})}}
  for(const fee of rules.fees)if(fee.kind==='percent'&&BigInt(fee.value)>1000000n)ctx.addIssue({code:'custom',message:'Unsupported percentage fee'})
})
const occupancySchema=z.object({adults:z.number().int().min(1).max(100),children:z.number().int().min(0).max(100)}).strict()
const percent=(base:bigint,bps:bigint)=>(base*bps+5000n)/10000n
export function calculatePrice(stay:StayRequest,input:RateRules,adjustment?:Money):PriceBreakdown{
  const rules=rateRulesSchema.parse(input),occupancy=occupancySchema.parse(stay.occupancy),nights=nightsBetween(stay.arrival,stay.departure)
  if(nights>365)throw new Error('Stay exceeds calculator bounds')
  const money=(value:bigint):Money=>({minor:value.toString(),currency:rules.currency}),components:QuoteComponent[]=[]
  let base=0n
  for(let n=0;n<nights;n++){
    const instant=new Date(Date.parse(stay.arrival)+n*86400000),date=instant.toISOString().slice(0,10)
    const special=rules.specialNights.find(night=>night.date===date)
    const value=BigInt(special?.minor??(rules.weekendDays.includes(instant.getUTCDay())&&rules.weekendNightMinor!==null?rules.weekendNightMinor:rules.nightMinor))
    base+=value;components.push({kind:'night',label:'Night '+date,date,amount:money(value)})
  }
  const extraAdults=Math.max(0,occupancy.adults-rules.includedAdults)
  if(extraAdults){const value=BigInt(extraAdults)*BigInt(nights)*BigInt(rules.extraAdultNightMinor);base+=value;components.push({kind:'extra-adult',label:`Extra adults · ${extraAdults} × ${nights} nights`,amount:money(value)})}
  if(occupancy.children){const value=BigInt(occupancy.children)*BigInt(nights)*BigInt(rules.childNightMinor);base+=value;components.push({kind:'child',label:`Children · ${occupancy.children} × ${nights} nights`,amount:money(value)})}
  const discountMoney=parseMoney(adjustment??money(0n))
  if(discountMoney.currency!==rules.currency)throw new Error('Discount currency mismatch')
  const discount=BigInt(discountMoney.minor)
  if(discount>base)throw new Error('Discount would create a negative subtotal')
  const discounted=base-discount
  if(discount)components.push({kind:'discount',label:'Account offer',amount:money(discount)})
  let fees=0n,taxes=0n
  for(const fee of rules.fees){const value=fee.kind==='percent'?percent(discounted,BigInt(fee.value)):BigInt(fee.value)*(fee.kind==='per-night'?BigInt(nights):1n);fees+=value;components.push({kind:'fee',label:fee.label,amount:money(value)})}
  const taxBase=discounted+(rules.taxBasis==='room-and-fees-after-discount'?fees:0n)
  for(const tax of rules.taxes){const value=percent(taxBase,BigInt(tax.bps));taxes+=value;components.push({kind:'tax',label:tax.label,amount:money(value)})}
  return {components,subtotal:money(base),discount:money(discount),fees:money(fees),taxes:money(taxes),total:money(discounted+fees+taxes)}
}
