import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {date,moneyFields,select} from '../fields/common'
export const PaymentTransactions: CollectionConfig={
  slug:'payment-transactions',access:commandOnly,
  indexes:[{fields:['environment','providerPaymentId'],unique:true},{fields:['booking','appliedRevision'],unique:true}],
  fields:[
    {name:'providerPaymentId',type:'text',required:true,index:true},
    {name:'merchantReference',type:'text',index:true},
    {name:'booking',type:'relationship',relationTo:'bookings',index:true},
    {name:'attempt',type:'relationship',relationTo:'payment-attempts',index:true},
    select('environment',['sandbox','production','offline']),...moneyFields,
    {name:'appliedRevision',type:'number',min:1},date('collectedAt',false),date('lastObservedAt',false),
    {name:'providerStatus',type:'text'},
    {name:'offlineEvidence',type:'json'},
    {name:'offlineReceiptKey',type:'text',unique:true},
    {name:'recordedByStaff',type:'relationship',relationTo:'staff-users'},
    select('status',['pending','authorized','collected','failed','voided'],'pending'),
  ],
}
