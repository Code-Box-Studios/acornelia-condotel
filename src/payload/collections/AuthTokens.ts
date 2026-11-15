import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const AuthTokens:CollectionConfig={slug:'auth-tokens',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},fields:[
  {name:'tokenHash',type:'text',required:true,unique:true},{name:'purpose',type:'select',options:['verify','reset'],required:true},
  {name:'account',type:'relationship',relationTo:'customers',required:true},{name:'emailHash',type:'text',required:true},{name:'securityRevision',type:'number',required:true,min:1},
  {name:'expiresAt',type:'date',required:true,index:true},{name:'usedAt',type:'date'},
]}
