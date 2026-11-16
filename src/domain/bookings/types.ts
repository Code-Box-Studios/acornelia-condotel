import type {Money} from '@/domain/shared/types'
export type CheckoutInput={commandKey:string;quoteId:string;version:number;contact:{name:string;email:string;phone:string;note?:string};stayingGuest?:string}
export type BookingTermsSnapshot={title:string;text:string;payment:'full';holdMinutes:number;thirdPartyBookings:boolean;timezone:string}
export type CheckoutRejection='invalid-input'|'access-required'|'quote-unavailable'|'quote-expired'|'already-prepared'|'command-conflict'|'unavailable'|'offer-unavailable'|'configuration-unavailable'|'contact-not-allowed'|'hold-limit'
export type CheckoutResult=
  |{state:'preparing'|'ready'|'checking';bookingId:string;attemptId:string;revision:number;deadline:string;total:Money}
  |{state:'confirmed';bookingId:string;attemptId:string|null;revision:number;deadline:string|null;total:Money}
  |{state:'rejected';code:CheckoutRejection}
