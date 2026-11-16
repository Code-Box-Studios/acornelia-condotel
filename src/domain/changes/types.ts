import type {StayRequest} from '@/domain/inventory/types'
export type StayChangePolicy={enabled:boolean;roles:('staff'|'developer')[];minHoursBeforeArrival:number;offerChanges:'unavailable';paymentMinutes:number;cancellation:{enabled:boolean;roles:('staff'|'developer')[];minHoursBeforeArrival:number;refund:'separate-authorization';offerUsage:'retain'}}
export type ChangeInput={quoteId:string;version:number;agreementReference:string;reason:string}
export type ChangeResult={kind:'completed'|'awaiting-payment'|'failed'|'abandoned';changeId:string;bookingId:string;revision:number;attemptId?:string;refundReviewMinor?:string}
export type CancellationResult={kind:'cancelled';bookingId:string;revision:number;cancellationId:string}
export type ChangeQuoteInput=StayRequest

export type CancellationInput={agreementReference:string;reason:string}
