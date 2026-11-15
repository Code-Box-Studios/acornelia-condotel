import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const AuthThrottles:CollectionConfig={slug:'auth-throttles',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:serverWrite,delete:()=>false},fields:[{name:'key',type:'text',required:true,unique:true},{name:'count',type:'number',required:true,min:0},{name:'expiresAt',type:'date',required:true,index:true}]}
