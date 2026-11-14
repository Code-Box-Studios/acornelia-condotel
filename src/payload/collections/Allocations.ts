import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {date,select} from '../fields/common'
export const Allocations: CollectionConfig={
  slug:'allocations',access:commandOnly,
  fields:[
    {name:'room',type:'relationship',relationTo:'rooms',required:true,index:true},
    {name:'booking',type:'relationship',relationTo:'bookings',index:true},
    date('arrival'),date('departure'),
    select('purpose',['hold','booking','block'],'hold'),
    {name:'released',type:'checkbox',required:true,defaultValue:false,index:true},
    date('deadline',false),
  ],
}
