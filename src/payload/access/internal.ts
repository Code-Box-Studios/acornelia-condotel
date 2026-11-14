import type {Access,PayloadRequest} from 'payload'
import {activeStaff} from './identity'
import type {Principal} from '@/domain/shared/types'
// Request identity is an in-process capability; JSON, query strings and user fields cannot forge it.
// Payload caches collection callbacks across Next bundles and HMR module instances.
const registry=globalThis as typeof globalThis & {__acorneliaCommandCapabilitiesV1?:WeakMap<object,Principal>}
const commands=registry.__acorneliaCommandCapabilitiesV1??=new WeakMap<object,Principal>()
// Payload isolates transactionID through a transparent Proxy during query validation.
// A non-enumerable symbol survives that proxy without granting authority to object spreads.
const capability=Symbol.for('acornelia.commandCapability.v1')
type CapableRequest=PayloadRequest&{[capability]?:object}
export function trustCommand(req:PayloadRequest,actor:Principal):void{
  let token=(req as CapableRequest)[capability]
  if(!token){token={};Object.defineProperty(req,capability,{value:token,enumerable:false})}
  commands.set(token,actor)
}
export function commandActor(req:PayloadRequest):Principal|undefined{
  const token=(req as CapableRequest)[capability]
  return token?commands.get(token):undefined
}
export const serverWrite:Access=({req})=>Boolean(commandActor(req))
export const staffRead:Access=({req})=>Boolean(commandActor(req))||activeStaff(req)
export const developerRead:Access=({req})=>activeStaff(req)&&req.user?.collection==='staff-users'&&req.user.role==='developer'
export const commandOnly={create:serverWrite,read:staffRead,update:serverWrite,delete:()=>false}
