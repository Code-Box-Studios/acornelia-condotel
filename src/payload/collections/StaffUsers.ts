import type { CollectionConfig } from 'payload'
import {activeStaff,developerOnly,ownAccount,rejectDeactivatedLogin,revokeOnDeactivate} from '../access/identity'
export const StaffUsers: CollectionConfig = {
  slug:'staff-users', auth:{useSessions:true,tokenExpiration:7200,maxLoginAttempts:5,lockTime:900000,removeTokenFromResponses:true,cookies:{sameSite:'Lax',secure:process.env.APP_ENV==='production'}},
  admin:{useAsTitle:'email'},
  access:{create:developerOnly,read:args=>developerOnly(args)?true:activeStaff(args.req)?ownAccount('staff-users')(args):false,update:developerOnly,delete:()=>false,admin:({req})=>activeStaff(req)},
  hooks:{beforeLogin:[rejectDeactivatedLogin],beforeChange:[revokeOnDeactivate]},
  fields:[{name:'deactivated',type:'checkbox',defaultValue:false,access:{create:developerOnly,update:developerOnly}},{name:'name',type:'text',required:true},{name:'role',type:'select',options:['staff','developer'],defaultValue:'staff',required:true,access:{create:()=>false,update:()=>false}}],
}
