import {AccountShell} from '@/components/AccountShell'
import {PrivateBookingView} from '@/features/booking/PrivateBookingView'
export const metadata={title:'Private booking',robots:{index:false,follow:false}}
export default function BookingView(){return <AccountShell eyebrow="Your Acornelia reservation" title="Your stay, privately." description="Read the reservation shared with you. No account is required."><PrivateBookingView/></AccountShell>}
