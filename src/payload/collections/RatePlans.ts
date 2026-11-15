import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
import {rateRulesSchema} from '@/domain/quotes/calculate'
export const RatePlans:CollectionConfig={slug:'rate-plans',admin:{group:'Booking configuration'},access:commandOnly,hooks:{beforeValidate:[({data})=>{if(data?.rules)data.rules=rateRulesSchema.parse(data.rules);return data}]},fields:[
  {name:'roomType',type:'relationship',relationTo:'room-types',required:true,index:true},
  {name:'policyVersion',type:'relationship',relationTo:'policy-versions',required:true,index:true},
  {name:'revision',type:'number',required:true,min:1},{name:'rules',type:'json',required:true},
  {name:'validFrom',type:'date',required:true},{name:'validUntil',type:'date',required:true},
  {name:'approved',type:'checkbox',required:true,defaultValue:false},{name:'approvalReference',type:'text'},
  {name:'synthetic',type:'checkbox',required:true,defaultValue:false},
]}
