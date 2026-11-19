import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {closeEnquiry} from '@/domain/operations/stay-actions'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
export async function POST(request:Request){
 try{const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied();const enquiry=await closeEnquiry(ctx,await readBoundedJson(request) as never);return staffJson({state:enquiry.state})}
 catch(error){return staffFailure(error)}
}
