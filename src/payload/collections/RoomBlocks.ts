import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
export const RoomBlocks:CollectionConfig={
  slug:'room-blocks',admin:{group:'Operations'},access:commandOnly,
  fields:[
    {name:'room',type:'relationship',relationTo:'rooms',required:true,index:true},
    {name:'allocation',type:'relationship',relationTo:'allocations',required:true,unique:true},
    {name:'arrival',type:'date',required:true},{name:'departure',type:'date',required:true},
    {name:'reason',type:'textarea',required:true},
    {name:'state',type:'select',options:['active','released'],required:true,defaultValue:'active'},
    {name:'releasedAt',type:'date'},
  ],
}
