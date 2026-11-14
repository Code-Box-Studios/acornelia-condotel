import type {GlobalConfig} from 'payload'
import {contentStaff} from '../access/content'
export const Policies:GlobalConfig={slug:'policies',label:'Public policy text',access:{read:contentStaff,update:contentStaff,readVersions:contentStaff},versions:{drafts:true},admin:{description:'Public copy only. Commercial rules require separately approved, versioned booking configuration.'},fields:[{name:'houseRules',type:'textarea'},{name:'cancellation',type:'textarea'},{name:'privacy',type:'textarea'}]}
