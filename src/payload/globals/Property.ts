import type {GlobalConfig} from 'payload'
import {contentStaff,rejectProductionFixture} from '../access/content'
export const Property:GlobalConfig={
  slug:'property',label:'Property and homepage',access:{read:contentStaff,update:contentStaff,readVersions:contentStaff},versions:{drafts:true},
  hooks:{beforeChange:[({data})=>{rejectProductionFixture(data);return data}]},
  fields:[
    {name:'name',type:'text',required:true},{name:'headline',type:'textarea',maxLength:160,admin:{description:'Homepage heading. Line breaks are supported.'}},{name:'headlineAccent',type:'text',maxLength:80},{name:'tagline',type:'text'},{name:'description',type:'textarea'},
    {name:'hero',type:'upload',relationTo:'media'},{name:'address',type:'textarea'},
    {name:'email',type:'email'},{name:'phone',type:'text'},{name:'mapUrl',type:'text',validate:(value:unknown)=>!value||typeof value==='string'&&/^https:\/\//.test(value)||'Use an HTTPS map URL'},
    {name:'synthetic',type:'checkbox',defaultValue:false,admin:{description:'Local review fixture. Production publication rejects this flag.'}},
    {name:'privateNotes',type:'textarea',admin:{description:'Never returned to public pages.'}},
  ],
}
