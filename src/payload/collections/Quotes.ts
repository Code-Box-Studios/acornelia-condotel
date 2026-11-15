import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
import {moneyFields} from '../fields/common'
export const Quotes:CollectionConfig={slug:'quotes',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},fields:[
  {name:'version',type:'number',required:true,min:1,defaultValue:1},
  {name:'issuerCustomer',type:'relationship',relationTo:'customers'},{name:'browserHash',type:'text',required:true},
  {name:'snapshot',type:'json',required:true},{name:'policySnapshot',type:'json',required:true},{name:'rateSnapshot',type:'json',required:true},
  {name:'policyVersion',type:'relationship',relationTo:'policy-versions',required:true},{name:'rateVersion',type:'relationship',relationTo:'rate-plans',required:true},
  ...moneyFields,{name:'issuedAt',type:'date',required:true},{name:'expiresAt',type:'date',required:true},
  {name:'acceptedAt',type:'date'},{name:'acceptedBy',type:'json'},
  {name:'consumedByBooking',type:'relationship',relationTo:'bookings',index:true},
]}
