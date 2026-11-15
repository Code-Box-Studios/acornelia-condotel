import type {CommandContext} from '@/domain/db/types'
import {verifyMayaDelivery,MayaDeliveryRejected,type MayaSignatureConfig} from './signature'
import {ingestMayaDelivery} from '@/domain/payments/inbox'
async function rawBody(request:Request):Promise<Uint8Array>{
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new MayaDeliveryRejected()
  const reader=request.body?.getReader();if(!reader)throw new MayaDeliveryRejected()
  const parts:Uint8Array[]=[];let size=0
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new MayaDeliveryRejected()};parts.push(part.value)}}finally{reader.releaseLock()}
  const body=new Uint8Array(size);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length};return body
}
export async function receiveMayaWebhook(request:Request,config:MayaSignatureConfig,context:CommandContext|(()=>Promise<CommandContext>)):Promise<Response>{
  try{
    // Authenticate before connecting to storage or resolving any browser identity.
    const now=typeof context==='function'?new Date().toISOString():context.clock.now()
    const delivery=verifyMayaDelivery(await rawBody(request),request.headers,config,now)
    await ingestMayaDelivery(typeof context==='function'?await context():context,delivery)
    return Response.json({received:true},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){return Response.json({received:false},{status:error instanceof MayaDeliveryRejected?401:503,headers:{'Cache-Control':'private, no-store'}})}
}
