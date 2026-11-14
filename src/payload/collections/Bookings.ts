import type { CollectionConfig } from 'payload'
import { commandOnly } from '../access/internal'
import {date,json,select} from '../fields/common'
export const Bookings: CollectionConfig={
  slug:'bookings',access:commandOnly,admin:{useAsTitle:'code'},
  fields:[
    {name:'code',type:'text',unique:true},
    {name:'ownerCustomerId',type:'text',index:true},
    select('status',['held','confirmed','cancelled','completed','expired'],'held'),
    {name:'revision',type:'number',required:true,defaultValue:1,min:1},
    date('arrival'),date('departure'),json('acceptedQuote'),json('contact'),
    {name:'stayingGuest',type:'text'},
    {name:'source',type:'select',required:true,options:['website','phone','walk-in'],defaultValue:'website'},
  ],
}
