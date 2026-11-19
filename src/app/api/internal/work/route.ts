import {fenced} from '@/http/fence'
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import {readBoundedJson} from '@/http/body'
import {getDatabase} from '@/domain/db/payload'
import {PayloadUnitOfWork} from '@/domain/db/unit-of-work'
import {resolveCurrentPolicy} from '@/domain/policy/current'
import {propertyToday} from '@/domain/shared/dates'
import {workKinds} from '@/domain/work/types'
import {assertWorkMode} from '@/domain/work/validation'
import {runWorkBatch} from '@/integrations/work-runner'
import {workHandlersFor} from '@/integrations/work-handlers'
import type {CommandContext} from '@/domain/db/types'
export const runtime='nodejs'
export const maxDuration=300
const body=z.object({kind:z.enum(workKinds).optional(),maxJobs:z.number().int().min(1).max(100).optional()}).strict()
const response=(data:unknown,status:number)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
async function handlePOST(request:Request){
  const secret=process.env.WORK_RUNNER_SECRET,authorization=request.headers.get('authorization')||''
  if(!secret||secret.length<32)return response({error:'Work runner is unavailable.'},503)
  const digest=(value:string)=>createHash('sha256').update(value).digest()
  if(!timingSafeEqual(digest(authorization),digest('Bearer '+secret)))return response({error:'Runner authentication required.'},401)
  let input
  try{input=body.parse(await readBoundedJson(request))}catch{return response({error:'Invalid work request.'},400)}
  try{
    assertWorkMode()
    const payload=await getDatabase()
    const ctx:CommandContext={actor:{kind:'system',purpose:'work'},policy:await resolveCurrentPolicy(payload),clock:{now:()=>new Date().toISOString(),today:timezone=>propertyToday(timezone)},uow:new PayloadUnitOfWork(payload),requestId:randomUUID()},handlers=workHandlersFor(ctx)
    if(!Object.keys(handlers).length||input.kind&&!handlers[input.kind])return response({error:'Work transport is not configured.'},503)
    const stats=await runWorkBatch(ctx,handlers,input)
    return response(stats,200)
  }catch{return response({error:'Work is unavailable; inspect protected operation status.'},503)}
}
export const POST=fenced('worker',handlePOST)
