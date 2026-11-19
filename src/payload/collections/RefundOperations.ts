import type {CollectionConfig} from 'payload'
import {commandDeveloperOnly} from '../access/internal'
export const RefundOperations:CollectionConfig={slug:'refund-operations',access:commandDeveloperOnly,admin:{useAsTitle:'commandKey'},indexes:[{fields:['providerEnvironment','providerOperationId'],unique:true}],fields:[
 {name:'commandKey',type:'text',required:true,unique:true},{name:'fingerprint',type:'text',required:true},
 {name:'origin',type:'select',options:['app','provider','offline'],required:true},
 {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},{name:'payment',type:'relationship',relationTo:'payment-transactions',required:true,index:true},
 {name:'authorizedStaff',type:'relationship',relationTo:'staff-users',index:true},{name:'change',type:'relationship',relationTo:'booking-changes',index:true},
 {name:'expectedRevision',type:'number',required:true,min:1},
 {name:'method',type:'select',options:['refund','void','offline'],required:true},
 {name:'state',type:'select',options:['authorized','dispatching','uncertain','completed','failed','cancelled','satisfied'],required:true},
 {name:'amountMinor',type:'text',required:true},{name:'currency',type:'text',required:true},
 {name:'reason',type:'select',options:['guest-cancellation','stay-change','duplicate-payment','late-payment','manual-review'],required:true},
 {name:'evidenceReference',type:'text'},{name:'policySnapshot',type:'json'},
 {name:'providerEnvironment',type:'select',options:['sandbox','production']},{name:'providerOperationId',type:'text',index:true},{name:'providerStatus',type:'text'},
 {name:'actualAmountMinor',type:'text'},{name:'actualCurrency',type:'text'},{name:'resultProof',type:'json'},
 {name:'dispatchGeneration',type:'number',required:true,defaultValue:0,min:0},{name:'dispatchedAt',type:'date'},
 {name:'observedAt',type:'date'},{name:'completedAt',type:'date'},{name:'reasonCode',type:'text'},
 {name:'reconcileSequence',type:'number',required:true,defaultValue:0,min:0},{name:'nextReconcileAt',type:'date'},
 {name:'lastEvidence',type:'relationship',relationTo:'refund-evidence',index:true},{name:'settledByRefund',type:'relationship',relationTo:'refund-operations',unique:true},
 {name:'offlineEvidence',type:'json'},{name:'offlineReceiptKey',type:'text',unique:true},{name:'reviewerStaff',type:'relationship',relationTo:'staff-users',index:true},
]}
