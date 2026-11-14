import type {Access,PayloadRequest} from 'payload'
import {activeStaff} from './identity'
import {commandActor} from './internal'
export const contentStaff:Access=({req})=>activeStaff(req)
export function localMediaWritable(req:PayloadRequest):boolean{return process.env.APP_ENV!=='production'&&(activeStaff(req)||commandActor(req)?.kind==='staff')}
export function rejectProductionFixture(data:Record<string,unknown>):void{if(process.env.APP_ENV==='production'&&data.synthetic)throw new Error('Synthetic content cannot be published in production')}
