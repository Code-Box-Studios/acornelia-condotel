import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
export const Enquiries:CollectionConfig={slug:'enquiries',admin:{group:'Operations',useAsTitle:'reference',description:'An enquiry does not reserve a room or confirm payment.'},access:commandOnly,fields:[
  {name:'reference',type:'text',required:true,unique:true},{name:'nonce',type:'text',required:true,unique:true},{name:'fingerprint',type:'text',required:true},{name:'emailHash',type:'text',required:true,index:true},
  {name:'submittedAt',type:'date',required:true,index:true},{name:'contact',type:'json',required:true},{name:'postSnapshot',type:'json'},
  {name:'state',type:'select',options:['received','delivery-pending','delivered','delivery-failed','closed'],required:true,defaultValue:'delivery-pending'},
  {name:'followUpOutcome',type:'select',options:['contacted','booked','not-pursued','duplicate']},{name:'closedAt',type:'date'},{name:'closedBy',type:'relationship',relationTo:'staff-users',index:true},
]}
