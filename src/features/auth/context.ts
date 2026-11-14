import {randomUUID} from 'node:crypto'
import {getDatabase} from '@/domain/db/payload'
import {PayloadUnitOfWork} from '@/domain/db/unit-of-work'
import {propertyToday} from '@/domain/shared/dates'
import type {CommandContext} from '@/domain/db/types'
import {principalFromHeaders} from './principal'
export async function requestContext(request:Request):Promise<CommandContext>{
  const payload=await getDatabase()
  return {
    actor:await principalFromHeaders(request.headers,payload),
    // Business commands must resolve/validate an approved policy before using this context.
    policy:{id:'unconfigured',revision:0,approvedSections:[],sections:{}},
    clock:{now:()=>new Date().toISOString(),today:timezone=>propertyToday(timezone)},
    uow:new PayloadUnitOfWork(payload),requestId:randomUUID(),
  }
}
