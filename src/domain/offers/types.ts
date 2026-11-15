import type {Money} from '@/domain/shared/types'
import type {QuoteRequest,PriceBreakdown} from '@/domain/quotes/types'
export type OfferReleaseReason='failed'|'expired-unpaid'|'cancelled'|'refunded'|'reissue'
export type OfferTerms={
  accountScope:'all-customers';currency:'PHP';roomScope:'all'|'selected';roomTypeIds:string[]
  bookingFrom:string;bookingUntil:string;stayFrom:string;stayUntil:string
  minimumSpend:Money;minimumSpendBasis:'eligible-charges'|'subtotal';eligibleComponents:('night'|'extra-adult'|'child')[]
  benefit:{kind:'fixed';minor:string}|{kind:'percent';bps:number};capMinor:string|null;overDiscount:'cap'|'reject'
  overallLimit:number|null;perAccountLimit:number|null;limitScope:'offer'|'version';stacking:'single-offer'
  expiryHandling:'reserve-before-window-end';rounding:'half-up';usage:Record<OfferReleaseReason,'release'|'retain'>
}
export type OfferVersion={id:string;offerId:string;policyVersionId:string;revision:number;name:string;terms:OfferTerms;synthetic:boolean}
/** Server-calculated basis; never accepted in public quote JSON. */
export type OfferPricingInput=QuoteRequest&{basis:PriceBreakdown}
export type OfferEvaluation={ok:true;discount:Money;versionId:string;expiresAt:string}|{ok:false;code:'account-required'|'unavailable'|'outside-window'|'inapplicable-stay'|'minimum-spend'|'negative-total'}
