import type {Principal} from '@/domain/shared/types'
export type Action='admin:enter'|'booking:create'|'booking:read'|'booking:manage'|'refund:request'|'offer:read'|'offer:write'|'content:write'|'room:write'|'audit:read'|'staff:manage'|'staff:grant-developer'|'enquiry:create'
export type AccessResource={kind:'admin'|'booking'|'offer'|'content'|'room'|'audit'|'staff-user'|'enquiry';ownerCustomerId?:string|null}
const resourceKind:Record<Action,AccessResource['kind']>={
  'admin:enter':'admin','booking:create':'booking','booking:read':'booking','booking:manage':'booking',
  'refund:request':'booking','offer:read':'offer','offer:write':'offer','content:write':'content',
  'room:write':'room','audit:read':'audit','staff:manage':'staff-user','staff:grant-developer':'staff-user','enquiry:create':'enquiry',
}
export function authorize(actor:Principal,action:Action,resource:AccessResource):void{
  let allowed=false
  if(resourceKind[action]!==resource.kind)throw new Error('Permission denied')
  if(action==='staff:grant-developer')throw new Error('Developer access requires the protected operator procedure')
  if(actor.kind==='anonymous')allowed=action==='booking:create'||action==='enquiry:create'
  if(actor.kind==='customer'){
    allowed=action==='booking:create'||action==='offer:read'||action==='enquiry:create'||(action==='booking:read'&&resource.ownerCustomerId===actor.id)
  }
  if(actor.kind==='staff'){
    allowed=actor.role==='developer'||['admin:enter','booking:read','offer:read'].includes(action)
  }
  if(actor.kind==='system'){
    allowed=actor.purpose==='recovery'&&action!=='audit:read'||actor.purpose==='payments'&&['booking:create','booking:manage'].includes(action)
  }
  if(!allowed)throw new Error('Permission denied')
}
