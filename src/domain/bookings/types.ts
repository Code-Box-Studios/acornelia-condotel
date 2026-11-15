import type {Money} from '@/domain/shared/types'
export type CheckoutInput={commandKey:string;quoteId:string;version:number;contact:{name:string;email:string;phone?:string};stayingGuest?:string}
export type CheckoutRejection='invalid-input'|'access-required'|'quote-unavailable'|'quote-expired'|'already-prepared'|'command-conflict'|'unavailable'|'offer-unavailable'|'configuration-unavailable'|'contact-not-allowed'
export type CheckoutResult=
  |{state:'preparing'|'ready'|'checking';bookingId:string;attemptId:string;revision:number;deadline:string;total:Money}
  |{state:'confirmed';bookingId:string;attemptId:string|null;revision:number;deadline:string|null;total:Money}
  |{state:'rejected';code:CheckoutRejection}
