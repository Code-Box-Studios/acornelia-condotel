import type {CollectionConfig} from 'payload'
import {commandDeveloperOnly} from '../access/internal'
export const RefundEvidence:CollectionConfig={slug:'refund-evidence',access:commandDeveloperOnly,admin:{hidden:true},fields:[
 {name:'semanticKey',type:'text',required:true,unique:true},
 {name:'payment',type:'relationship',relationTo:'payment-transactions',required:true,index:true},{name:'operation',type:'relationship',relationTo:'refund-operations',index:true},
 {name:'environment',type:'select',options:['sandbox','production','offline'],required:true},
 {name:'kind',type:'select',options:['refund','void','offline'],required:true},
 {name:'providerOperationId',type:'text',index:true},{name:'providerPaymentId',type:'text',required:true},
 {name:'amountMinor',type:'text',required:true},{name:'currency',type:'text',required:true},{name:'providerStatus',type:'text',required:true},
 {name:'source',type:'select',options:['merchant-get','merchant-post','staff-attested','staff-reviewed'],required:true},
 {name:'observedAt',type:'date',required:true},{name:'proof',type:'json',required:true},{name:'workGeneration',type:'number',min:1},
 {name:'sourceStaff',type:'relationship',relationTo:'staff-users',index:true},{name:'reviewerStaff',type:'relationship',relationTo:'staff-users',index:true},
 {name:'state',type:'select',options:['pending','processed','exception'],required:true,defaultValue:'pending'},{name:'processedAt',type:'date'},{name:'reasonCode',type:'text'},
]}
