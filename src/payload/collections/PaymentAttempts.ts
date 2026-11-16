import type { CollectionConfig } from 'payload'
import {commandOnly} from '../access/internal'
import {date,json,moneyFields,select} from '../fields/common'
export const PaymentAttempts: CollectionConfig={
  slug:'payment-attempts',access:commandOnly,
  fields:[
    {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},
    {name:'merchantReference',type:'text',required:true,unique:true},
    {name:'commandKey',type:'text',required:true,unique:true},
    {name:'fingerprint',type:'text',required:true},
    ...moneyFields,json('acceptedContext'),
    select('purpose',['booking','change'],'booking'),
    {name:'revision',type:'number',required:true,min:1},
    select('state',['preparing','ready','unknown','pending','succeeded','closed'],'preparing'),
    {name:'createOutcome',type:'select',options:['created','refused','unknown']},{name:'createRefusalCode',type:'text'},date('createObservedAt',false),
    date('closedAt',false),json('closeEvidence',false),date('lastReconciledAt',false),date('nextReconcileAt',false),date('escalatedAt',false),
    {name:'reconcileSequence',type:'number',required:true,defaultValue:0,min:0},{name:'resumeCount',type:'number',required:true,defaultValue:0,min:0},date('resumeRequestedAt',false),
    date('deadline'),{name:'checkoutUrl',type:'text'},{name:'providerCheckoutId',type:'text'},
    {name:'providerEnvironment',type:'select',options:['sandbox','production']},
  ],
}
