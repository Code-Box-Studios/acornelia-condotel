import {z} from 'zod'
import {randomUUID} from 'node:crypto'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Principal} from '@/domain/shared/types'
import {encryptPrivateState,decryptPrivateState,matchesPrivateDigest,privateDigest,opaqueSecret} from '@/domain/security/private-state'
import {validateBookingSearch,type BookingSearchInput} from './search'
export interface CheckoutDraft {stay:BookingSearchInput;contact:{name?:string;email?:string;phone?:string;stayingGuestName?:string;note?:string};version?:number}
export interface DraftRef {id:string;secret:string;version:number;commandKey?:string}
export interface DraftSession {ctx:CommandContext;browserKey:string;ref?:DraftRef;expectedVersion?:number}
const stateSchema=z.object({stay:z.object({roomTypeId:z.uuid().optional(),arrival:z.string(),departure:z.string(),occupancy:z.object({adults:z.number().int(),children:z.number().int()}).strict()}).strict(),contact:z.object({name:z.string().max(120).optional(),email:z.string().max(254).optional(),phone:z.string().max(40).optional(),stayingGuestName:z.string().max(120).optional(),note:z.string().max(1000).optional()}).strict(),version:z.number().int().min(1).optional()}).strict()
const secretSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const refSchema=z.object({id:z.uuid(),secret:secretSchema,version:z.number().int().min(1),commandKey:z.uuid().optional()}).strict()
function requireSession(session:DraftSession|undefined,actor?:Principal):DraftSession{
  if(!session)throw new Error('A server-bound draft session is required')
  secretSchema.parse(session.browserKey)
  const current=session.ctx.actor
  if(!['anonymous','customer'].includes(current.kind)||actor&&(actor.kind!==current.kind||actor.kind==='customer'&&(current.kind!=='customer'||actor.id!==current.id)))throw new Error('Draft unavailable')
  return session
}
async function readBoundDraft(tx:DbTx,ref:DraftRef,session:DraftSession){
  const parsed=refSchema.parse(ref)
  const result=await tx.payload.findByID({collection:'checkout-drafts',id:parsed.id,req:tx.req,overrideAccess:false,disableErrors:true})
  if(!result||!matchesPrivateDigest(parsed.secret,result.secretHash)||!matchesPrivateDigest('browser-draft\0'+session.browserKey,result.browserHash)||Date.parse(result.expiresAt)<=Date.parse(session.ctx.clock.now())||result.ownerCustomerId&&(tx.actor.kind!=='customer'||result.ownerCustomerId!==tx.actor.id))throw new Error('Draft unavailable')
  return result
}
function verifiedCustomer(tx:DbTx){if(tx.actor.kind==='customer'&&(tx.req.user?.collection!=='customers'||!tx.req.user._verified))throw new Error('Draft unavailable')}
export async function saveCheckoutDraft(input:CheckoutDraft,session?:DraftSession):Promise<DraftRef>{
  const access=requireSession(session),parsed=stateSchema.parse(input)
  validateBookingSearch(parsed.stay)
  const value={stay:parsed.stay,contact:parsed.contact}
  return access.ctx.uow.run(access.ctx.actor,async tx=>{
    verifiedCustomer(tx)
    if(access.ref){
      const existing=await readBoundDraft(tx,access.ref,access)
      if(access.expectedVersion!==existing.version)throw new Error('This draft changed in another tab. Reload before continuing.')
      const version=existing.version+1,commandKey=existing.commandKey??randomUUID()
      await tx.payload.update({collection:'checkout-drafts',id:existing.id,data:{version,commandKey,ownerCustomerId:existing.ownerCustomerId||(tx.actor.kind==='customer'?tx.actor.id:undefined),encryptedState:encryptPrivateState(value,'checkout-draft:'+existing.id)},req:tx.req,overrideAccess:false})
      return {...access.ref,version,commandKey}
    }
    const secret=opaqueSecret(),commandKey=randomUUID()
    const result=await tx.payload.create({collection:'checkout-drafts',data:{commandKey,secretHash:privateDigest(secret),browserHash:privateDigest('browser-draft\0'+access.browserKey),ownerCustomerId:tx.actor.kind==='customer'?tx.actor.id:undefined,expiresAt:new Date(Date.parse(access.ctx.clock.now())+30*60000).toISOString(),version:1,encryptedState:'pending'},req:tx.req,overrideAccess:false})
    await tx.payload.update({collection:'checkout-drafts',id:result.id,data:{encryptedState:encryptPrivateState(value,'checkout-draft:'+result.id)},req:tx.req,overrideAccess:false})
    return {id:result.id,secret,version:1,commandKey}
  })
}
export async function resumeCheckoutDraft(ref:DraftRef,actor:Principal,session?:DraftSession):Promise<CheckoutDraft>{
  const access=requireSession(session,actor)
  return access.ctx.uow.run(actor,async tx=>{
    verifiedCustomer(tx)
    const result=await readBoundDraft(tx,ref,access)
    return {...stateSchema.parse(decryptPrivateState(result.encryptedState,'checkout-draft:'+result.id)),version:result.version}
  })
}
