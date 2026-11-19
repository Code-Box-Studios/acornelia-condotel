import {fenced} from '@/http/fence'
import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {createRoomBlock,releaseRoomBlock} from '@/domain/inventory/blocks'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),roomId:z.uuid(),arrival:z.string(),departure:z.string(),reason:z.string()}).strict(),
 z.object({action:z.literal('release'),blockId:z.uuid()}).strict(),
])
/** Room blocks keep the inventory module's own developer and policy checks. */
async function handlePOST(request:Request){
 try{
  const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied()
  const value=schema.parse(await readBoundedJson(request))
  if(value.action==='create'){const {action:_action,...input}=value;void _action;return staffJson({state:'blocked',...await createRoomBlock(ctx,input)},201)}
  await releaseRoomBlock(ctx,value.blockId);return staffJson({state:'released'})
 }catch(error){return staffFailure(error)}
}
export const POST=fenced('authentication',handlePOST)
