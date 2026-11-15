import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
import {date,moneyFields,select} from '../fields/common'
export const PaymentInbox:CollectionConfig={
  slug:'payment-inbox',access:commandOnly,
  fields:[
    {name:'semanticKey',type:'text',required:true,unique:true},
    {name:'deliveryKey',type:'text',required:true},
    {name:'providerPaymentId',type:'text',required:true,index:true},
    {name:'merchantReference',type:'text',index:true},
    select('environment',['sandbox','production']),...moneyFields,
    {name:'providerStatus',type:'text',required:true},
    {name:'method',type:'text'},date('providerPaidAt',false),date('receivedAt'),
    select('source',['webhook','retrieval'],'webhook'),
    select('state',['pending','processed','exception'],'pending'),date('processedAt',false),
    {name:'reasonCode',type:'text'},
  ],
}
