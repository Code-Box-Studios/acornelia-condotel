import type {GlobalConfig} from 'payload'
import {contentStaff} from '../access/content'
export const SitePages:GlobalConfig={slug:'site-pages',label:'About and contact copy',access:{read:contentStaff,update:contentStaff,readVersions:contentStaff},versions:{drafts:true},fields:[{name:'about',type:'textarea'},{name:'contact',type:'textarea'}]}
