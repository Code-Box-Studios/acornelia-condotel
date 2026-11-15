import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const AuthDeliveries:CollectionConfig={slug:'auth-deliveries',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},fields:[
  {name:'purpose',type:'select',options:['verify','reset'],required:true},{name:'account',type:'relationship',relationTo:'customers',required:true},{name:'tokenRef',type:'relationship',relationTo:'auth-tokens',required:true},
  {name:'expiresAt',type:'date',required:true},{name:'encryptedState',type:'textarea',required:true},{name:'state',type:'select',options:['pending','delivered','failed','cancelled'],required:true,defaultValue:'pending'},
]}
