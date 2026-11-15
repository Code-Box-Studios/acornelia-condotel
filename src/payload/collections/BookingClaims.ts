import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const BookingClaims:CollectionConfig={
  slug:'booking-claims',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},
  fields:[
    {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},
    {name:'customer',type:'relationship',relationTo:'customers',required:true,index:true},
    {name:'reviewer',type:'relationship',relationTo:'staff-users',required:true},
    {name:'purpose',type:'select',options:['booking-claim'],required:true},
    {name:'tokenHash',type:'text',required:true,unique:true},
    {name:'proof',type:'json',required:true},
    {name:'policyId',type:'text',required:true},{name:'policyRevision',type:'number',required:true,min:1},
    {name:'securityRevision',type:'number',required:true,min:1},
    {name:'expiresAt',type:'date',required:true,index:true},{name:'usedAt',type:'date'},{name:'revokedAt',type:'date'},
  ],
}
