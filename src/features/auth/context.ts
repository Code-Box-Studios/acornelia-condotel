import {randomUUID} from 'node:crypto'
import {getDatabase} from '@/domain/db/payload'
import {PayloadUnitOfWork} from '@/domain/db/unit-of-work'
import {propertyToday} from '@/domain/shared/dates'
import type {CommandContext} from '@/domain/db/types'
import {resolveCurrentPolicy} from '@/domain/policy/current'
import {readQuoteBrowser} from '@/features/booking/quote-session'
import {principalFromHeaders} from './principal'
export async function requestContext(request:Request):Promise<CommandContext>{
  const payload=await getDatabase()
  return {
    actor:await principalFromHeaders(request.headers,payload),
    // Each business command validates its required immutable policy sections.
    policy:await resolveCurrentPolicy(payload),browserKey:readQuoteBrowser(request),
    clock:{now:()=>new Date().toISOString(),today:timezone=>propertyToday(timezone)},
    uow:new PayloadUnitOfWork(payload),requestId:randomUUID(),
  }
}
