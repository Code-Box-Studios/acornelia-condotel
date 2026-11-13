import type { CollectionConfig } from 'payload'
export const StaffUsers: CollectionConfig = {
  slug:'staff-users', auth:{tokenExpiration:7200,maxLoginAttempts:5,lockTime:900000},
  admin:{useAsTitle:'email'},
  access:{create:()=>false,read:({req})=>req.user?.collection==='staff-users',update:()=>false,delete:()=>false,admin:({req})=>req.user?.collection==='staff-users'},
  fields:[{name:'name',type:'text',required:true},{name:'role',type:'select',options:['staff','developer'],defaultValue:'staff',required:true,access:{create:()=>false,update:()=>false}}],
}
