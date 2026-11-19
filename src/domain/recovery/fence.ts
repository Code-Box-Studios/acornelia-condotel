import type {Payload,PayloadRequest} from 'payload'
import {fenceFrom,type Fence} from '@/config/operation-mode'
/** The newest accepted generation. Missing or unreadable state returns null, which fails closed. */
export async function databaseGeneration(payload:Payload,req?:PayloadRequest):Promise<string|null>{
 try{return (await payload.find({collection:'recovery-fences',sort:'-createdAt',limit:1,depth:0,overrideAccess:true,...(req?{req}:{})})).docs[0]?.generation??null}catch{return null}
}
export async function currentFence(payload:Payload,req?:PayloadRequest):Promise<Fence>{return fenceFrom(process.env,await databaseGeneration(payload,req))}
