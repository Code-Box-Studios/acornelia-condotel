import type {OfferTerms} from '@/domain/offers/types'
export function syntheticOfferTerms(overrides:Partial<OfferTerms>={}):OfferTerms{return {
  accountScope:'all-customers',currency:'PHP',roomScope:'all',roomTypeIds:[],bookingFrom:'2026-11-01T00:00:00Z',bookingUntil:'2026-12-01T00:00:00Z',stayFrom:'2026-11-01',stayUntil:'2028-01-01',minimumSpend:{minor:'0',currency:'PHP'},minimumSpendBasis:'eligible-charges',eligibleComponents:['night'],benefit:{kind:'fixed',minor:'1500'},capMinor:null,overDiscount:'cap',overallLimit:1,perAccountLimit:1,limitScope:'offer',stacking:'single-offer',expiryHandling:'reserve-before-window-end',rounding:'half-up',usage:{failed:'release','expired-unpaid':'release',cancelled:'retain',refunded:'retain',reissue:'release'},...overrides,
}}
