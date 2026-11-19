import {fenced} from '@/http/fence'
import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {cancelBooking} from '@/domain/changes/cancel'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
const schema=z.object({bookingId:z.uuid(),expectedRevision:z.number().int().positive(),agreementReference:z.string(),reason:z.string()}).strict()
/** Staff cancellation keeps Task 22's role, cutoff and agreement rules; it never asserts a refund. */
async function handlePOST(request:Request){
 try{
  const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied()
  const value=schema.parse(await readBoundedJson(request))
  await cancelBooking(ctx,value.bookingId,value.expectedRevision,{agreementReference:value.agreementReference,reason:value.reason})
  return staffJson({state:'cancelled'})
 }catch(error){return staffFailure(error)}
}
export const POST=fenced('authentication',handlePOST)
