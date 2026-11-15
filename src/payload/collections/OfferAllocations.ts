import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {select} from '../fields/common'
export const OfferAllocations: CollectionConfig={
  slug:'offer-allocations',access:commandOnly,
  fields:[
    {name:'offer',type:'relationship',relationTo:'offers',required:true,index:true},{name:'offerVersion',type:'relationship',relationTo:'offer-versions',required:true,index:true},{name:'quote',type:'relationship',relationTo:'quotes',index:true},
    {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},
    {name:'allocationKey',type:'text',required:true,unique:true},
    select('state',['reserved','consumed','released'],'reserved'),
    {name:'customer',type:'relationship',relationTo:'customers',required:true,index:true},{name:'consumedAt',type:'date'},{name:'releasedAt',type:'date'},{name:'releaseReason',type:'select',options:['failed','expired-unpaid','cancelled','refunded','reissue']},
  ],
}
