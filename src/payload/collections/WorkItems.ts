import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {date,json,select} from '../fields/common'
export const WorkItems: CollectionConfig={
  slug:'work-items',access:commandOnly,
  fields:[
    {name:'semanticKey',type:'text',required:true,unique:true},
    select('kind',['create-checkout','reconcile-payment','expire-hold','email','refund','enquiry']),
    json('payload'),select('state',['ready','leased','done','uncertain','failed'],'ready'),
    {name:'generation',type:'number',required:true,defaultValue:0,min:0},
    {name:'attempts',type:'number',required:true,defaultValue:0,min:0},
    {name:'leaseOwner',type:'text'},date('leaseExpires',false),date('availableAt'),{name:'lastError',type:'text'},
  ],
}
