import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readStatusCookie} from '@/features/booking/status-http'
import {checkoutDestination} from '@/features/booking/status'
import {readBoundedForm} from '@/http/form'
export async function POST(request:Request){
  let bookingId:string|undefined
  try{
    const form=await readBoundedForm(request)
    if([...form.keys()].length!==1||form.getAll('bookingId').length!==1)throw new Error('Invalid handoff')
    bookingId=z.uuid().parse(form.get('bookingId'))
    const capability=readStatusCookie(request,bookingId);if(!capability)throw new Error('Private access is required')
    const destination=await checkoutDestination(await requestContext(request),capability,bookingId)
    return new Response(null,{status:303,headers:{Location:destination,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
  }catch{
    const destination=new URL(bookingId?'/book/payment?bookingId='+bookingId+'&access=unavailable':'/book',process.env.APP_URL!)
    return new Response(null,{status:303,headers:{Location:destination.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
  }
}
