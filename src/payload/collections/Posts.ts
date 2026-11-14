import {randomUUID} from 'node:crypto'
import {APIError,type CollectionConfig} from 'payload'
import {contentStaff,rejectProductionFixture} from '../access/content'
import {parsePropertyDate} from '@/domain/shared/dates'
import {plain,publicImage} from '@/content/public-property'
export const Posts:CollectionConfig={
  slug:'posts',admin:{useAsTitle:'title',group:'Website',preview:doc=>`/updates/preview/${doc.id}`},
  access:{create:contentStaff,update:contentStaff,read:contentStaff,delete:()=>false,readVersions:contentStaff},versions:{drafts:true},
  hooks:{beforeValidate:[({data,originalDoc})=>{
    if(!plain(data?.title??originalDoc?.title))throw new APIError('A post title is required, including drafts',400)
    if(data&&!data.slug&&!originalDoc?.slug)data.slug=(plain(data.title).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'post')+'-'+randomUUID().slice(0,8)
    return data
  }],beforeChange:[async({data,originalDoc,req})=>{
    const value={...originalDoc,...data}
    rejectProductionFixture(value)
    if(value.eventDate)parsePropertyDate(value.eventDate)
    if(value._status==='published'){
      if(!plain(value.summary)||!plain(value.body))throw new APIError('Summary and body are required before publication',400)
      if(value.type==='event'&&!value.eventDate)throw new APIError('An event date is required before publication',400)
      if(value.cover){const id=typeof value.cover==='object'?value.cover.id:value.cover;const media=await req.payload.findByID({collection:'media',id,req,overrideAccess:false});if(!publicImage(media))throw new APIError('Choose a ready public image before publishing',400)}
      data.publishedAt=originalDoc?.publishedAt||new Date().toISOString()
    }
    return data
  }]},
  fields:[{name:'type',type:'select',options:['story','event'],required:true,defaultValue:'story'},
    {name:'title',type:'text',required:true,maxLength:180},{name:'slug',type:'text',required:true,unique:true,index:true,validate:(value:unknown)=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)||'Use a lowercase URL slug'},
    {name:'summary',type:'textarea',maxLength:600},{name:'body',type:'textarea',maxLength:50000},
    {name:'eventDate',type:'text',admin:{description:'Property calendar date, YYYY-MM-DD. Required for published events.'},validate:(value:unknown)=>{if(!value)return true;try{parsePropertyDate(value);return true}catch{return 'Use a real YYYY-MM-DD calendar date'}}},
    {name:'cover',type:'upload',relationTo:'media'},{name:'publishedAt',type:'date',access:{create:()=>false,update:()=>false},admin:{readOnly:true}},
    {name:'synthetic',type:'checkbox',defaultValue:false,admin:{description:'Local review fixture; production excludes and refuses publication.'}},{name:'privateNotes',type:'textarea'},
  ],
}
