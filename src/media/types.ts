import type {Principal} from '@/domain/shared/types'
export interface MediaInput {bytes:Buffer;filename:string;mimeType:'image/jpeg'|'image/png'|'image/webp';alt:string;source:string;license:string;accessClass:'private'|'public';synthetic?:boolean}
export interface MediaAsset {id:string;url:string|null;status:string}
export interface MediaStore {put(actor:Principal,input:MediaInput):Promise<MediaAsset>;read(actor:Principal,id:string):Promise<MediaAsset>;remove(actor:Principal,id:string):Promise<void>}
