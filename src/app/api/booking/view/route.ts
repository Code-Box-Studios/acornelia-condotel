import {fenced} from '@/http/fence'
import {readBoundedJson} from '@/http/body'
import {requestContext} from '@/features/auth/context'
import {verifyBookingView,type BookingViewRef} from '@/features/booking/view-access'
async function handlePOST(request:Request){
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
  try{
    const item=await verifyBookingView(await requestContext(request),await readBoundedJson(request) as BookingViewRef)
    if(!item)throw new Error('Unavailable')
    return Response.json({code:item.code,status:item.status,arrival:item.arrival,departure:item.departure,acceptedTotal:item.acceptedTotal,contactName:item.contact.name,stayingGuest:item.stayingGuest.name},{headers})
  }catch{return Response.json({error:'This private link is invalid or has expired.'},{status:401,headers})}
}
export const POST=fenced('private-link',handlePOST)
