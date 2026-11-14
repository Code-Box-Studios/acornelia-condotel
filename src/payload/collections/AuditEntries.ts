import type { CollectionConfig } from 'payload'
import {validateAuditRecord} from '@/domain/audit/append'
import {commandActor} from '../access/internal'
import {serverWrite,developerRead} from '../access/internal'
import {json,text} from '../fields/common'
export const AuditEntries: CollectionConfig={
  slug:'audit-entries',access:{create:serverWrite,read:developerRead,update:()=>false,delete:()=>false},
  admin:{hidden:({user})=>user?.collection!=='staff-users'||user.role!=='developer'},
  hooks:{beforeValidate:[({data,req})=>{if(!data)throw new Error('Audit data required');return {...data,...validateAuditRecord({...data,actor:commandActor(req)||data.actor})}}]},
  fields:[json('actor'),text('action'),text('recordType'),text('recordId',false),text('outcome'),json('safeChanges',false)],
}
