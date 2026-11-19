import type {CollectionConfig} from 'payload'
import {ownAccount,rejectDeactivatedLogin,revokeOnDeactivate} from '../access/identity'
export const Customers:CollectionConfig={
  slug:'customers',
  auth:{
    useSessions:true,verify:true,tokenExpiration:7200,maxLoginAttempts:5,lockTime:900000,removeTokenFromResponses:true,
    cookies:{sameSite:'Lax',secure:process.env.APP_ENV==='production'},
    ...(process.env.APP_ENV==='production'&&process.env.CUSTOMER_AUTH_METHOD!=='email-password'?{disableLocalStrategy:{enableFields:true as const}}:{}),
  },
  admin:{useAsTitle:'email',hidden:true},
  access:{create:()=>false,read:ownAccount('customers'),update:()=>false,delete:()=>false,admin:()=>false},
  hooks:{beforeLogin:[rejectDeactivatedLogin],beforeChange:[revokeOnDeactivate]},
  fields:[{name:'securityRevision',type:'number',required:true,defaultValue:1,min:1,access:{create:()=>false,read:()=>false,update:()=>false}},{name:'name',type:'text',required:true},{name:'deactivated',type:'checkbox',defaultValue:false,access:{create:()=>false,update:()=>false}},{name:'anonymizedAt',type:'date',access:{create:()=>false,read:()=>false,update:()=>false}},{name:'recoveryHoldAt',type:'date',access:{create:()=>false,read:()=>false,update:()=>false}}],
}
