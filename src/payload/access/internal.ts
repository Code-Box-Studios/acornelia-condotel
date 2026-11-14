import type {Access,PayloadRequest} from 'payload'
import {activeStaff} from './identity'
import type {Principal} from '@/domain/shared/types'
// Request identity is an in-process capability; JSON, query strings and user fields cannot forge it.
// Payload caches collection callbacks across Next bundles and HMR module instances.
const registry=globalThis as typeof globalThis & {__acorneliaCommandCapabilitiesV1?:WeakMap<PayloadRequest,Principal>}
const commands=registry.__acorneliaCommandCapabilitiesV1??=new WeakMap<PayloadRequest,Principal>()
export function trustCommand(req:PayloadRequest,actor:Principal):void{commands.set(req,actor)}
export function commandActor(req:PayloadRequest):Principal|undefined{return commands.get(req)}
export const serverWrite:Access=({req})=>Boolean(commandActor(req))
export const staffRead:Access=({req})=>Boolean(commandActor(req))||activeStaff(req)
export const developerRead:Access=({req})=>activeStaff(req)&&req.user?.collection==='staff-users'&&req.user.role==='developer'
export const commandOnly={create:serverWrite,read:staffRead,update:serverWrite,delete:()=>false}
