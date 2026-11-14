import type {CollectionConfig} from 'payload'
import {contentStaff,rejectProductionFixture} from '../access/content'
export const RoomTypes:CollectionConfig={
  slug:'room-types',admin:{useAsTitle:'name',group:'Website'},access:{read:contentStaff,create:contentStaff,update:contentStaff,delete:()=>false,readVersions:contentStaff},versions:{drafts:true},
  hooks:{beforeChange:[({data})=>{rejectProductionFixture(data);return data}]},
  fields:[
    {name:'name',type:'text',required:true},{name:'slug',type:'text',required:true,unique:true,index:true,validate:(value:unknown)=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)||'Use a lowercase URL slug'},
    {name:'description',type:'textarea'},{name:'maxGuests',type:'number',min:1,max:100,validate:(value:unknown)=>value==null||Number.isInteger(value)||'Use a whole guest count'},
    {name:'bedDescription',type:'text'},{name:'amenities',type:'array',fields:[{name:'label',type:'text',required:true}]},
    {name:'gallery',type:'array',fields:[{name:'image',type:'upload',relationTo:'media',required:true}]},
    {name:'sortOrder',type:'number',defaultValue:0},{name:'synthetic',type:'checkbox',defaultValue:false},{name:'privateNotes',type:'textarea'},
  ],
}
