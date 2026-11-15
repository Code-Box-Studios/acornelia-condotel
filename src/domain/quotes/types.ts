import type {Money} from '@/domain/shared/types'
import type {PolicySnapshot} from '@/domain/policy/types'
import type {StayRequest} from '@/domain/inventory/types'
export type RateRules={currency:'PHP';nightMinor:string;weekendDays:number[];weekendNightMinor:string|null;specialNights:{date:string;minor:string}[];includedAdults:number;extraAdultNightMinor:string;childNightMinor:string;fees:{label:string;kind:'fixed'|'per-night'|'percent';value:string}[];taxes:{label:string;bps:number}[];taxBasis:'room-after-discount'|'room-and-fees-after-discount';rounding:'half-up-per-line'}
export type QuoteComponent={kind:'night'|'extra-adult'|'child'|'discount'|'fee'|'tax';label:string;date?:string;amount:Money}
export type PriceBreakdown={components:QuoteComponent[];subtotal:Money;discount:Money;fees:Money;taxes:Money;total:Money}
export type QuoteRequest={stay:StayRequest}
export type QuoteSnapshot=PriceBreakdown&{id:string;version:number;stay:StayRequest;roomType:{id:string;name:string};policyVersionId:string;policyRevision:number;rateVersionId:string;offerVersionId:string|null;issuedAt:string;expiresAt:string;synthetic:boolean}
export type AcceptedQuote=QuoteSnapshot&{acceptedAt:string;policySnapshot:PolicySnapshot;rateSnapshot:RateRules}
