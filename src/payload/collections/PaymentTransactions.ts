import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {moneyFields,select} from '../fields/common'
export const PaymentTransactions: CollectionConfig={
  slug:'payment-transactions',access:commandOnly,
  fields:[
    {name:'providerPaymentId',type:'text',required:true,unique:true},
    {name:'merchantReference',type:'text',required:true,index:true},
    {name:'booking',type:'relationship',relationTo:'bookings',index:true},
    {name:'attempt',type:'relationship',relationTo:'payment-attempts',index:true},
    select('environment',['sandbox','production','offline']),...moneyFields,
    select('status',['pending','authorized','collected','failed','voided'],'pending'),
  ],
}
