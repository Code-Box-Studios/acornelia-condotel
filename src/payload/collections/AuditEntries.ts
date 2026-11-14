import type { CollectionConfig } from 'payload'
import {serverWrite,developerRead} from '../access/internal'
import {json,text} from '../fields/common'
export const AuditEntries: CollectionConfig={
  slug:'audit-entries',access:{create:serverWrite,read:developerRead,update:()=>false,delete:()=>false},
  admin:{hidden:({user})=>user?.collection!=='staff-users'||user.role!=='developer'},
  fields:[json('actor'),text('action'),text('recordType'),text('recordId',false),text('outcome'),json('safeChanges',false)],
}
