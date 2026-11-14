import type {Payload} from 'payload'
import {getDatabase} from '@/domain/db/payload'
import {plain,publicImage,type PublicImage} from './public-property'
export interface PublicRoom {id:string;slug:string;name:string;description:string;maxGuests:number|null;bedDescription:string;amenities:string[];images:PublicImage[];synthetic:boolean}
export async function readRoomCatalog(payload?:Payload):Promise<PublicRoom[]>{
  const db=payload??await getDatabase()
  const result=await db.find({collection:'room-types',where:{and:[{_status:{equals:'published'}},...(process.env.APP_ENV==='production'?[{synthetic:{equals:false}}]:[])]},draft:false,depth:2,sort:['sortOrder','name'],limit:100,overrideAccess:true})
  return result.docs.map(room=>({id:room.id,slug:room.slug,name:plain(room.name),description:plain(room.description),maxGuests:room.maxGuests??null,bedDescription:plain(room.bedDescription),amenities:(room.amenities??[]).map(x=>plain(x.label)),images:(room.gallery??[]).map(x=>publicImage(x.image)).filter((image):image is PublicImage=>image!==null),synthetic:!!room.synthetic}))
}
