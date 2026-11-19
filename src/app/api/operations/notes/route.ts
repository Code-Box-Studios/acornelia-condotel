import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {addStaffNote} from '@/domain/operations/stay-actions'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
export async function POST(request:Request){
 try{const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied();const note=await addStaffNote(ctx,await readBoundedJson(request) as never);return staffJson({state:'saved',id:note.id},201)}
 catch(error){return staffFailure(error)}
}
