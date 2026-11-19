import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
import {date,select} from '../fields/common'
export const PaymentIssues:CollectionConfig={
  slug:'payment-issues',access:commandOnly,
  fields:[
    {name:'issueKey',type:'text',required:true,unique:true},
    {name:'reasonCode',type:'text',required:true},
    {name:'booking',type:'relationship',relationTo:'bookings',index:true},
    {name:'attempt',type:'relationship',relationTo:'payment-attempts',index:true},
    {name:'payment',type:'relationship',relationTo:'payment-transactions',index:true},
    {name:'inbox',type:'relationship',relationTo:'payment-inbox',index:true},
    {name:'observedAmountMinor',type:'text'}, {name:'observedCurrency',type:'text'},
    select('state',['open','resolved'],'open'),date('resolvedAt',false),
    {name:'resolutionCode',type:'text'},
    {name:'resolutionReference',type:'text'},{name:'resolvedBy',type:'relationship',relationTo:'staff-users',index:true},
  ],
}
