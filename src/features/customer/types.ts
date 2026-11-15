import type {Booking,PaymentAttempt,PaymentTransaction} from '@/payload-types'
import type {Money} from '@/domain/shared/types'
export type BookingSummary={
  id:string;code:string|null;status:Booking['status'];arrival:string;departure:string
  booker:{customerId:string|null};contact:{name:string|null;email:string|null;phone:string|null};stayingGuest:{name:string|null}
  acceptedTotal:Money|null
  payments:{attempts:{id:string;state:PaymentAttempt['state'];amount:Money}[];transactions:{id:string;status:PaymentTransaction['status'];amount:Money}[]}
}
export type BookingPage={items:BookingSummary[];nextCursor:string|null}
