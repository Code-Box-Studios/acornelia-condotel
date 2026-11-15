import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const CheckoutDrafts:CollectionConfig={slug:'checkout-drafts',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},fields:[
  {name:'secretHash',type:'text',required:true},{name:'browserHash',type:'text',required:true},{name:'ownerCustomerId',type:'text'},
  {name:'expiresAt',type:'date',required:true,index:true},{name:'version',type:'number',required:true,min:1},{name:'encryptedState',type:'textarea',required:true},
]}
