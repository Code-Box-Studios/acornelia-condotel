import {fenced} from '@/http/fence'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {recordStayAction} from '@/domain/operations/stay-actions'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
async function handlePOST(request:Request){
 try{const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied();const event=await recordStayAction(ctx,await readBoundedJson(request) as never);return staffJson({state:'recorded',kind:event.kind},201)}
 catch(error){return staffFailure(error)}
}
export const POST=fenced('authentication',handlePOST)
