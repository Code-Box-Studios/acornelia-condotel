import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
export const PolicyVersions:CollectionConfig={slug:'policy-versions',admin:{group:'Booking configuration'},access:commandOnly,fields:[
  {name:'revision',type:'number',required:true,min:1,unique:true},
  {name:'approvedSections',type:'json',required:true},{name:'sections',type:'json',required:true},
  {name:'approved',type:'checkbox',required:true,defaultValue:false},{name:'active',type:'checkbox',required:true,defaultValue:false},
  {name:'approvalReference',type:'text'},{name:'synthetic',type:'checkbox',required:true,defaultValue:false},
]}
