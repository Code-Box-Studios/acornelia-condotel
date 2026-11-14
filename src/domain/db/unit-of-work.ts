import {createLocalReq,type CollectionSlug,type Payload,type PayloadRequest,type TypedUser} from 'payload'
import type {Principal} from '../shared/types'
import type {DbTx,UnitOfWork} from './types'
import {trustCommand} from '@/payload/access/internal'

function databaseCode(error:unknown,depth=0):string|undefined{
  if(depth>6 || !error || typeof error!=='object')return undefined
  const value=error as {code?:unknown;cause?:unknown}
  return typeof value.code==='string'?value.code:databaseCode(value.cause,depth+1)
}
async function userForActor(payload:Payload,actor:Principal,req:PayloadRequest):Promise<TypedUser|undefined>{
  if(actor.kind==='anonymous'||actor.kind==='system')return undefined
  const collection=actor.collection as CollectionSlug
  if(!payload.collections[collection]?.config.auth)throw new Error('Identity collection is not configured')
  const record=await payload.findByID({collection,id:actor.id,overrideAccess:true,depth:0,req})
  if('deactivated' in record&&record.deactivated)throw new Error('Account is inactive')
  if(actor.kind==='staff'&&(!('role' in record)||record.role!==actor.role))throw new Error('Staff authority changed')
  return {...record,collection} as TypedUser
}

/** All work in this callback must be database-only: a conflict retries the entire callback. */
export class PayloadUnitOfWork implements UnitOfWork {
  constructor(private readonly payload:Payload){}
  async run<T>(actor:Principal,work:(tx:DbTx)=>Promise<T>):Promise<T>{
    for(let attempt=0;attempt<4;attempt++){
      const transactionID=await this.payload.db.beginTransaction({isolationLevel:'serializable'})
      if(transactionID===null)throw new Error('Atomic database transactions are required')
      try{
        const req=await createLocalReq({req:{transactionID}},this.payload)
        req.user=(await userForActor(this.payload,actor,req))??null
        trustCommand(req,actor)
        const result=await work({payload:this.payload,req,actor})
        await this.payload.db.commitTransaction(transactionID)
        return result
      }catch(error){
        try{await this.payload.db.rollbackTransaction(transactionID)}catch{/* Preserve the original failure. */}
        if(attempt<3&&['40001','40P01'].includes(databaseCode(error)||'')){
          await new Promise(resolve=>setTimeout(resolve,10*(attempt+1)))
          continue
        }
        throw error
      }
    }
    throw new Error('Transaction retry limit exhausted')
  }
}
export async function runSerializable<T>(actor:Principal,work:(tx:DbTx)=>Promise<T>):Promise<T>{
  const {getDatabase}=await import('./payload')
  return new PayloadUnitOfWork(await getDatabase()).run(actor,work)
}
