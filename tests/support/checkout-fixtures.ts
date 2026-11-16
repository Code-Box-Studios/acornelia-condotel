import {syntheticDirectPolicy} from './direct-policy'
import {syntheticEmailPolicy} from './email-policy'
import {syntheticRecovery} from './recovery-policy'
import {randomUUID} from 'node:crypto'
import type {TestHarness} from './harness'
import {opaqueSecret} from '@/domain/security/private-state'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {startCheckout} from '@/domain/bookings/start-checkout'
import type {CommandContext} from '@/domain/db/types'
import type {CheckoutInput} from '@/domain/bookings/types'
export async function checkoutFixture(h:TestHarness,options:{customer?:boolean;rooms?:number;thirdPartyBookings?:boolean;direct?:Parameters<typeof syntheticDirectPolicy>[0];contactName?:string;claims?:boolean;zero?:boolean;allowZero?:boolean;latePayment?:'confirm-if-available'|'staff-review';email?:Parameters<typeof syntheticEmailPolicy>[0];recovery?:Parameters<typeof syntheticRecovery>[0]}={}){
  const policy=await h.seed('policy-versions',{revision:1,active:true,approved:true,synthetic:true,approvalReference:'synthetic-checkout-dispatch',approvedSections:['stay','pricing','checkout','work','maya','checkoutStatus','bookingTerms','offers','latePayment','paymentRecovery',...(options.direct?['directBookings']:[]),...(options.email?['transactionalEmail']:[]),...(options.claims?['historical-claims']:[])],sections:{...(options.direct?{directBookings:syntheticDirectPolicy(options.direct)}:{}),...(options.claims?{'historical-claims':{method:'staff-reviewed-original-evidence',tokenMinutes:30}}:{}),...(options.email?{transactionalEmail:syntheticEmailPolicy(options.email)}:{}),paymentRecovery:syntheticRecovery(options.recovery),latePayment:{action:options.latePayment??'staff-review',maxMinutes:60},stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:options.zero||options.allowZero?'confirm-without-payment':'unavailable'},offers:{enabled:true,accountScope:'all-customers',discountOrder:'before-fees-and-tax'},checkout:{payment:'full',holdMinutes:15,thirdPartyBookings:options.thirdPartyBookings??true},work:{leaseSeconds:30,maxAttempts:3,maxBatch:5,backoffSeconds:[5,30],runSeconds:10},checkoutStatus:{minutes:120,pollPerMinute:60},bookingTerms:{title:'Synthetic booking terms',text:'Local testing terms only. This is not a live accommodation offer.'},maya:{environment:'sandbox',approvalReference:'synthetic-checkout-capabilities',checkoutEnabled:true,kountEnabled:false,voidEnabled:false,refundEnabled:false,partialRefunds:false,moneyMethods:[],maxAmountMinor:'1000000',timeoutMs:1000,checkoutMethods:['card'],methodConfigurationReference:'synthetic-method-review'}}})
  const type=await h.seed('room-types',{name:'Dispatch room fixture',slug:'dispatch-room',maxGuests:2,onSale:true,_status:'published'})
  for(let index=0;index<(options.rooms??1);index++)await h.seed('rooms',{label:index?'PRIVATE-DISPATCH-ROOM-'+(index+1):'PRIVATE-DISPATCH-ROOM',roomType:type.id,onSale:true})
  await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:1,rules:{currency:'PHP',nightMinor:options.zero?'0':'10000',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'},validFrom:'2026-11-15T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-dispatch-rate'})
  const customer=await h.seed('customers',{name:'Dispatch account',email:'dispatch-account@example.test',password:'Synthetic-dispatch-passphrase-946!',_verified:true})
  const ctx:CommandContext={...h.ctx(options.customer?{kind:'customer',collection:'customers',id:customer.id}:{kind:'anonymous'}),browserKey:opaqueSecret(),policy:{id:policy.id,revision:1,synthetic:true,approvedSections:policy.approvedSections as string[],sections:policy.sections as Record<string,unknown>}}
  const quote=await quoteStay(ctx,{stay:{roomTypeId:type.id,arrival:'2027-05-10',departure:'2027-05-12',occupancy:{adults:2,children:0}}})
  await acceptQuote(ctx,quote.id,quote.version)
  const input:CheckoutInput={commandKey:randomUUID(),quoteId:quote.id,version:quote.version,contact:{name:options.contactName??'Dispatch guest',email:'dispatch-guest@example.test',phone:'+639171234567'},stayingGuest:options.thirdPartyBookings===false?(options.contactName??'Dispatch guest'):'Staying guest'}
  const receipt=await startCheckout(ctx,input)
  if(receipt.state==='rejected')throw new Error('Fixture preparation rejected: '+receipt.code)
  const worker={...ctx,browserKey:undefined,actor:{kind:'system' as const,purpose:'work' as const}}
  return {ctx,worker,receipt,input,quote,customer,policy,type}
}
