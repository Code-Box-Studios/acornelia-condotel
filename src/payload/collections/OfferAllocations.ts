import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {select} from '../fields/common'
export const OfferAllocations: CollectionConfig={
  slug:'offer-allocations',access:commandOnly,
  fields:[
    {name:'offerVersionId',type:'text',required:true,index:true},
    {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},
    {name:'allocationKey',type:'text',required:true,unique:true},
    select('state',['reserved','consumed','released'],'reserved'),
    {name:'customerId',type:'text',required:true,index:true},
  ],
}
