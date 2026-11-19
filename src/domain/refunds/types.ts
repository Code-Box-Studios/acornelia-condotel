import type {Money} from '@/domain/shared/types'
export type RefundMethod='refund'|'void'|'offline'
export type RefundReason='guest-cancellation'|'stay-change'|'duplicate-payment'|'late-payment'|'manual-review'
export type RefundInput={commandKey:string;paymentId:string;expectedRevision:number;amount:Money;method:RefundMethod;reason:RefundReason;evidenceReference:string;changeId?:string}
export type RefundPolicy={enabled:boolean;roles:('staff'|'developer')[];methods:RefundMethod[];currency:'PHP';maxAmountMinor:string;externalActions:'pause-before-manual';offlineReview:'disabled'|'independent-staff';manualResolution?:'disabled'|'independent-provider-review';reconcileSeconds:number;maxChecks:number;checkFreshnessMinutes?:number}
