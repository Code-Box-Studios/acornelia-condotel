import {fenced} from '@/http/fence'
import {randomUUID} from 'node:crypto'
import {configuredMayaSignature} from '@/integrations/maya/signature-config'
import {receiveMayaWebhook} from '@/integrations/maya/webhook'
import {getDatabase} from '@/domain/db/payload'
import {PayloadUnitOfWork} from '@/domain/db/unit-of-work'
import {propertyToday} from '@/domain/shared/dates'
import {resolveCurrentPolicy} from '@/domain/policy/current'
export const runtime='nodejs'
async function handlePOST(request:Request){
  const config=configuredMayaSignature()
  if(!config)return Response.json({received:false},{status:503,headers:{'Cache-Control':'private, no-store'}})
  return receiveMayaWebhook(request,config,async()=>{
    const payload=await getDatabase()
    return {actor:{kind:'system',purpose:'payments'},policy:await resolveCurrentPolicy(payload),clock:{now:()=>new Date().toISOString(),today:timezone=>propertyToday(timezone)},uow:new PayloadUnitOfWork(payload),requestId:randomUUID()}
  })
}
export const POST=fenced('provider-intake',handlePOST)
