import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
import {offerTermsSchema} from '@/domain/offers/validation'
export const OfferVersions:CollectionConfig={slug:'offer-versions',admin:{group:'Booking configuration'},access:commandOnly,hooks:{beforeValidate:[({data})=>{if(data?.terms)data.terms=offerTermsSchema.parse(data.terms);return data}]},fields:[
  {name:'offer',type:'relationship',relationTo:'offers',required:true,index:true},
  {name:'policyVersion',type:'relationship',relationTo:'policy-versions',required:true,index:true},
  {name:'name',type:'text',required:true},{name:'revision',type:'number',required:true,min:1},
  {name:'terms',type:'json',required:true},{name:'approved',type:'checkbox',required:true,defaultValue:false},
  {name:'approvalReference',type:'text'},{name:'publishedAt',type:'date',required:true},
  {name:'synthetic',type:'checkbox',required:true,defaultValue:false},
]}
