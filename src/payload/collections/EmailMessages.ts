import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const EmailMessages:CollectionConfig={slug:'email-messages',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},fields:[
  {name:'semanticKey',type:'text',required:true,unique:true},
  {name:'category',type:'select',required:true,options:['booking','booking-view','auth','claim','staff-reset','enquiry','payment-issue']},
  {name:'encryptedSnapshot',type:'textarea',required:true},{name:'encryptedMessage',type:'textarea'},
  {name:'booking',type:'relationship',relationTo:'bookings'},{name:'revision',type:'number'},{name:'authDelivery',type:'relationship',relationTo:'auth-deliveries'},
  {name:'enquiry',type:'relationship',relationTo:'enquiries'},{name:'issue',type:'relationship',relationTo:'payment-issues'},
  {name:'expiresAt',type:'date'},{name:'state',type:'select',options:['pending','accepted','failed','uncertain','cancelled'],required:true,defaultValue:'pending'},
  {name:'providerMessageId',type:'text'},{name:'acceptedAt',type:'date'},{name:'reason',type:'select',options:['temporary','permanent','timeout','transport','partial','expired','quota','obsolete']},
  {name:'reservedDay',type:'text'},{name:'recipientCount',type:'number'},
]}
