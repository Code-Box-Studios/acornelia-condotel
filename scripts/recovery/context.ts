import './load-env'
import {randomUUID} from 'node:crypto'
import {getPayload} from 'payload'
import {PayloadUnitOfWork} from '../../src/domain/db/unit-of-work'
import {resolveCurrentPolicy} from '../../src/domain/policy/current'
import {propertyToday} from '../../src/domain/shared/dates'
import type {CommandContext} from '../../src/domain/db/types'
/** Recovery commands run as the system recovery operator, never through a restored login or session. */
export async function recoveryContext(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required')
 const config=(await import('../../payload.config')).default,payload=await getPayload({config})
 const ctx:CommandContext={actor:{kind:'system',purpose:'recovery'},policy:await resolveCurrentPolicy(payload),clock:{now:()=>new Date().toISOString(),today:timezone=>propertyToday(timezone)},uow:new PayloadUnitOfWork(payload),requestId:randomUUID()}
 return {payload,ctx}
}
