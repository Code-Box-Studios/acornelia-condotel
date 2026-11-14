import {createLocalReq,type Payload} from 'payload'
import {z} from 'zod'
import type {Principal} from '@/domain/shared/types'
import {trustCommand} from '@/payload/access/internal'
import type {MediaStore,MediaAsset} from './types'
const metadata=z.object({filename:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),mimeType:z.enum(['image/jpeg','image/png','image/webp']),alt:z.string().trim().min(1).max(500),source:z.string().trim().min(1).max(1000),license:z.string().trim().min(1).max(2000),accessClass:z.enum(['private','public']),synthetic:z.boolean().optional()})
export function createMediaStore(payload:Payload):MediaStore{
  async function staffRequest(actor:Principal){
    if(actor.kind!=='staff'||!['development','test'].includes(process.env.APP_ENV||''))throw new Error('Authorized local media operation required')
    const user=await payload.findByID({collection:'staff-users',id:actor.id,overrideAccess:true})
    if(user.deactivated||user.role!==actor.role)throw new Error('Staff authority changed')
    const req=await createLocalReq({user:{...user,collection:'staff-users'}},payload)
    trustCommand(req,actor)
    return req
  }
  function asset(doc:{id:string;filename?:string|null;status:string}):MediaAsset{return {id:doc.id,status:doc.status,url:doc.status==='ready'&&doc.filename?`/api/media/file/${encodeURIComponent(doc.filename)}`:null}}
  return {
    async put(actor,input){
      const {filename,mimeType,...data}=metadata.parse(input)
      if(!Buffer.isBuffer(input.bytes)||input.bytes.length===0||input.bytes.length>10*1024*1024)throw new Error('Image must be between 1 byte and 10 MiB')
      const req=await staffRequest(actor)
      // Persist a private, non-renderable intent before touching file storage.
      const intent=await payload.create({collection:'media',data:{...data,status:'uploading'},req,overrideAccess:false})
      try{return asset(await payload.update({collection:'media',id:intent.id,data:{status:'ready'},file:{data:input.bytes,mimetype:mimeType,name:filename,size:input.bytes.length},req,overrideAccess:false}))}
      catch(error){await payload.update({collection:'media',id:intent.id,data:{status:'failed'},req,overrideAccess:false});throw error}
    },
    async read(actor,id){
      const req=actor.kind==='staff'?await staffRequest(actor):await createLocalReq({},payload)
      return asset(await payload.findByID({collection:'media',id,req,depth:0,overrideAccess:false}))
    },
    async remove(actor,id){
      const req=await staffRequest(actor)
      await payload.update({collection:'media',id,data:{status:'deleting',accessClass:'private'},req,overrideAccess:false})
      try{await payload.delete({collection:'media',id,req,overrideAccess:false})}
      catch(error){await payload.update({collection:'media',id,data:{status:'failed'},req,overrideAccess:false});throw error}
    },
  }
}
