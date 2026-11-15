import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const BookingViews:CollectionConfig={
  slug:'booking-views',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},
  fields:[
    {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},
    {name:'tokenHash',type:'text',required:true,unique:true},
    {name:'purpose',type:'select',options:['booking-view','checkout-status'],required:true,defaultValue:'booking-view'},
    {name:'browserHash',type:'text'},{name:'customer',type:'relationship',relationTo:'customers',index:true},
    {name:'expiresAt',type:'date',required:true,index:true},{name:'revokedAt',type:'date'},
  ],
}
