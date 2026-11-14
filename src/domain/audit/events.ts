import type {Payload,PayloadRequest,TypedUser} from 'payload'
import type {Principal} from '../shared/types'
import type {AuditInput} from './types'
import {PayloadUnitOfWork} from '../db/unit-of-work'
import {appendAudit} from './append'
import {commandActor} from '@/payload/access/internal'
export function actorFromUser(user:TypedUser|null|undefined):Principal{
  if(!user||user.deactivated)return {kind:'anonymous'}
  return user.collection==='staff-users'?{kind:'staff',collection:'staff-users',id:user.id,role:user.role}:{kind:'customer',collection:'customers',id:user.id}
}
export async function recordEvent(payload:Payload,actor:Principal,entry:AuditInput):Promise<void>{
  await new PayloadUnitOfWork(payload).run(actor,tx=>appendAudit(tx,entry))
}
export async function recordRefusedAttempt(payload:Payload,actor:Principal,entry:AuditInput):Promise<void>{
  try{await recordEvent(payload,actor,entry)}catch(error){
    const status=error&&typeof error==='object'&&'status' in error&&typeof error.status==='number'?error.status:undefined
    payload.logger.warn({errorName:error instanceof Error?error.name:'unknown',status},'Refused-action telemetry could not be persisted')
  }
}
export function eventActor(req:PayloadRequest):Principal{return commandActor(req)||actorFromUser(req.user)}
export async function recordGatewayRefusal(reason:'bootstrap'|'origin'|'disabled'|'invalid'):Promise<void>{
  if(process.env.APP_OPERATION_MODE!=='normal')return
  try{
    const {getDatabase}=await import('../db/payload')
    const payload=await getDatabase()
    await recordRefusedAttempt(payload,{kind:'anonymous'},{action:'gateway:refused',recordType:'gateway',outcome:'refused',safeChanges:{reasonCode:reason}})
  }catch{console.warn('Gateway refusal telemetry could not be persisted')}
}
