import {getDatabase} from '@/domain/db/payload'
import {operationAllowed,type OperationClass} from '@/config/operation-mode'
import {currentFence} from '@/domain/recovery/fence'
/** Refuses a route with 503 unless the external fence and the database generation allow its operation class. */
export function fenced<A extends unknown[]>(operation:OperationClass,handler:(...args:A)=>Promise<Response>|Response){
 return async(...args:A):Promise<Response>=>{
  let allowed=false
  try{allowed=operationAllowed(operation,await currentFence(await getDatabase()))}catch{allowed=false}
  if(!allowed)return Response.json({error:'This service is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Retry-After':'300'}})
  return handler(...args)
 }
}
