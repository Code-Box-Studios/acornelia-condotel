import Link from 'next/link'
import {z} from 'zod'
import {PaymentStatus} from '@/features/booking/PaymentStatus'
export const metadata={title:'Your booking status',robots:{index:false,follow:false}}
export default async function Payment({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams,id=z.uuid().safeParse(params.bookingId)
  return <main id="main" className="shell section copy-page">{id.success?<PaymentStatus bookingId={id.data} returned={params.outcome!==undefined}/>:<section className="status-panel"><h1>Your checkout session.</h1><p>Open your original checkout page or contact Acornelia for help.</p><Link href="/contact">Contact Acornelia</Link></section>}</main>
}
