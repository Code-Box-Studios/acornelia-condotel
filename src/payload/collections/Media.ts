import path from 'node:path'
import {APIError,type Where,type CollectionConfig} from 'payload'
import {activeStaff} from '../access/identity'
import {commandActor} from '../access/internal'
import {localMediaWritable,rejectProductionFixture} from '../access/content'
export const Media:CollectionConfig={
  slug:'media',admin:{useAsTitle:'alt',group:'Website',description:'Local uploads persist on the development disk. Production storage must be configured before uploading.'},
  access:{create:({req})=>localMediaWritable(req),update:({req})=>localMediaWritable(req),delete:({req})=>localMediaWritable(req),read:({req})=>{if(activeStaff(req)||commandActor(req)?.kind==='staff')return true;const and:Where[]=[{accessClass:{equals:'public'}},{status:{equals:'ready'}}];if(process.env.APP_ENV==='production')and.push({synthetic:{equals:false}});return {and}}},
  upload:{staticDir:process.env.APP_ENV==='test'?path.resolve(process.cwd(),'.local/test-media'):path.resolve(process.cwd(),'media'),disableLocalStorage:process.env.APP_ENV==='production',filesRequiredOnCreate:false,mimeTypes:['image/jpeg','image/png','image/webp'],adminThumbnail:'thumbnail',imageSizes:[{name:'thumbnail',width:640,height:480,position:'centre'}]},
  hooks:{beforeChange:[({data,originalDoc,req})=>{
    rejectProductionFixture(data)
    if(req.file)data.status='ready'
    if(data.status==='ready'&&!req.file&&!originalDoc?.filename)throw new APIError('A ready media asset requires a stored image',400)
    if(!req.file&&!originalDoc?.filename&&commandActor(req)?.kind!=='staff')throw new APIError('Choose an image before saving',400)
    return data
  }]},
  fields:[
    {name:'alt',type:'text',required:true},{name:'source',type:'text',required:true,access:{read:({req})=>activeStaff(req)||commandActor(req)?.kind==='staff'}},{name:'license',type:'textarea',required:true,access:{read:({req})=>activeStaff(req)||commandActor(req)?.kind==='staff'}},
    {name:'accessClass',type:'select',options:['private','public'],defaultValue:'private',required:true},
    {name:'status',type:'select',options:['uploading','ready','deleting','failed'],defaultValue:'uploading',required:true,access:{create:({req})=>!!req.file||commandActor(req)?.kind==='staff',update:({req})=>!!req.file||commandActor(req)?.kind==='staff'},admin:{readOnly:true}},
    {name:'synthetic',type:'checkbox',defaultValue:false},
  ],
}
