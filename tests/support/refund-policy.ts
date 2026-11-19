import type {RefundPolicy} from '@/domain/refunds/types'
export function syntheticRefundPolicy(overrides:Partial<RefundPolicy>={}):RefundPolicy{return {enabled:true,roles:['developer'],methods:['refund','void','offline'],currency:'PHP',maxAmountMinor:'1000000',externalActions:'pause-before-manual',offlineReview:'independent-staff',reconcileSeconds:30,maxChecks:3,...overrides}}
