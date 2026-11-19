import type {Payload} from 'payload'
import type {Media} from '@/payload-types'
import {getDatabase} from '@/domain/db/payload'
import {siteDesign,siteDesigns} from '@/config/design'
export interface PublicImage {id:string;url:string;alt:string;width:number|null;height:number|null}
export interface PublicProperty {name:string;headline:string;headlineAccent:string;tagline:string;description:string;address:string|null;email:string|null;phone:string|null;mapUrl:string|null;hero:PublicImage|null;synthetic:boolean;pages:{about:string;contact:string};policies:{houseRules:string;cancellation:string;privacy:string}}
/** Content is plain text. Arbitrary HTML, scripts and page code are not public authoring fields. */
export function plain(value:unknown):string{return typeof value==='string'?value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,'').trim():''}
export function publicImage(value:string|Media|null|undefined):PublicImage|null{
  if(!value||typeof value==='string'||value.accessClass!=='public'||value.status!=='ready'||!value.filename||!plain(value.alt)||process.env.APP_ENV==='production'&&value.synthetic)return null
  return {id:value.id,url:`/api/media/file/${encodeURIComponent(value.filename)}`,alt:plain(value.alt),width:value.width??null,height:value.height??null}
}
export async function readPublicProperty(payload?:Payload):Promise<PublicProperty|null>{
  const db=payload??await getDatabase()
  const property=await db.findGlobal({slug:'property',draft:false,depth:1,overrideAccess:true})
  if(property._status!=='published'||!property.name||process.env.APP_ENV==='production'&&property.synthetic)return null
  const [pages,policies]=await Promise.all([db.findGlobal({slug:'site-pages',draft:false,overrideAccess:true}),db.findGlobal({slug:'policies',draft:false,overrideAccess:true})])
  return {name:plain(property.name),headline:plain(property.headline)||(property.synthetic?siteDesigns[siteDesign].sample.headline:plain(property.name)),headlineAccent:plain(property.headlineAccent)||(property.synthetic?siteDesigns[siteDesign].sample.headlineAccent:''),tagline:plain(property.tagline),description:plain(property.description),address:plain(property.address)||null,email:plain(property.email)||null,phone:plain(property.phone)||null,mapUrl:property.mapUrl?.startsWith('https://')?property.mapUrl:null,hero:publicImage(property.hero),synthetic:!!property.synthetic,pages:{about:pages._status==='published'?plain(pages.about):'',contact:pages._status==='published'?plain(pages.contact):''},policies:{houseRules:policies._status==='published'?plain(policies.houseRules):'',cancellation:policies._status==='published'?plain(policies.cancellation):'',privacy:policies._status==='published'?plain(policies.privacy):''}}
}
