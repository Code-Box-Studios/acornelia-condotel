import {enqueue} from '@/domain/work/enqueue'
import {createHash,createHmac,randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {Payload,Where} from 'payload'
import type {Post} from '@/payload-types'
import {getDatabase} from '@/domain/db/payload'
import {parsePropertyDate} from '@/domain/shared/dates'
import {appendAudit} from '@/domain/audit/append'
import {authorize} from '@/features/auth/authorization'
import {plain,publicImage,type PublicImage} from './public-property'
import type {CommandContext} from '@/domain/db/types'
export type PostFilter='all'|'stories'|'upcoming'
export interface PublicPost {id:string;slug:string;type:'story'|'event';title:string;summary:string;body:string;eventDate:string|null;publishedAt:string|null;cover:PublicImage|null}
export interface PostPage {items:PublicPost[];total:number;nextCursor:string|null}
export interface EnquiryInput {nonce:string;postId?:string;name:string;email:string;phone?:string;message:string;consent:true;website?:string}
const cursorSchema=z.object({date:z.iso.datetime(),id:z.uuid()}).strict()
function projectPost(post:Post):PublicPost{return {id:post.id,slug:post.slug,type:post.type,title:plain(post.title),summary:plain(post.summary),body:plain(post.body),eventDate:post.eventDate||null,publishedAt:post.publishedAt||null,cover:publicImage(post.cover)}}
export async function listPosts(filter:PostFilter,cursor:string|null,today:string,payload?:Payload):Promise<PostPage>{
  z.enum(['all','stories','upcoming']).parse(filter);parsePropertyDate(today)
  const db=payload??await getDatabase(),and:Where[]=[{_status:{equals:'published'}}]
  if(process.env.APP_ENV==='production')and.push({synthetic:{equals:false}})
  if(filter==='stories')and.push({type:{equals:'story'}})
  if(filter==='upcoming')and.push({type:{equals:'event'}},{eventDate:{greater_than_equal:today}})
  const base={and:[...and]}
  if(cursor){if(cursor.length>500)throw new Error('Invalid cursor');const parsed=cursorSchema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString()));and.push({or:[{publishedAt:{less_than:parsed.date}},{and:[{publishedAt:{equals:parsed.date}},{id:{less_than:parsed.id}}]}]})}
  const [result,count]=await Promise.all([db.find({collection:'posts',where:{and},draft:false,depth:1,sort:['-publishedAt','-id'],limit:12,overrideAccess:true}),db.count({collection:'posts',where:base,overrideAccess:true})])
  const last=result.docs.at(-1)
  return {items:result.docs.map(projectPost),total:count.totalDocs,nextCursor:result.hasNextPage&&last?.publishedAt?Buffer.from(JSON.stringify({date:last.publishedAt,id:last.id})).toString('base64url'):null}
}
export async function readPublishedPost(slug:string,payload?:Payload):Promise<PublicPost|null>{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>180)return null
  const db=payload??await getDatabase(),result=await db.find({collection:'posts',where:{and:[{slug:{equals:slug}},{_status:{equals:'published'}},...(process.env.APP_ENV==='production'?[{synthetic:{equals:false}}]:[])]},draft:false,depth:1,limit:1,overrideAccess:true})
  return result.docs[0]?projectPost(result.docs[0]):null
}
export async function readPostPreview(ctx:CommandContext,id:string):Promise<PublicPost>{
  if(ctx.actor.kind!=='staff')throw new Error('Staff preview access required')
  return ctx.uow.run(ctx.actor,async tx=>{
    const post=await tx.payload.findByID({collection:'posts',id,draft:true,depth:1,req:tx.req,overrideAccess:false}),projected=projectPost(post)
    const image=post.cover
    if(image&&typeof image!=='string'&&image.filename&&image.status==='ready')projected.cover={id:image.id,url:`/api/media/file/${encodeURIComponent(image.filename)}`,alt:plain(image.alt),width:image.width??null,height:image.height??null}
    return projected
  })
}
const enquirySchema=z.object({nonce:z.uuid(),postId:z.uuid().optional(),name:z.string().trim().min(1).max(120),email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),phone:z.string().trim().max(40).optional(),message:z.string().trim().min(5).max(3000),consent:z.literal(true),website:z.string().max(0).optional()}).strict()
export async function submitEnquiry(ctx:CommandContext,input:EnquiryInput):Promise<string>{
  authorize(ctx.actor,'enquiry:create',{kind:'enquiry'})
  const parsed=enquirySchema.parse(input)
  if(process.env.APP_ENV==='production'&&!ctx.policy.approvedSections.includes('enquiries'))throw new Error('Enquiries are not configured for production')
  const {nonce,postId,...contact}=parsed
  const fingerprint=createHash('sha256').update(JSON.stringify({postId,...contact})).digest('hex')
  const emailHash=createHmac('sha256',process.env.PAYLOAD_SECRET!).update('enquiry-rate\0'+contact.email).digest('hex')
  return ctx.uow.run(ctx.actor,async tx=>{
    const previous=await tx.payload.find({collection:'enquiries',where:{nonce:{equals:nonce}},limit:1,req:tx.req,overrideAccess:false})
    if(previous.docs[0]){if(previous.docs[0].fingerprint!==fingerprint)throw new Error('Enquiry reference conflict');return previous.docs[0].id}
    const since=new Date(Date.parse(ctx.clock.now())-3600000).toISOString()
    const recent=await tx.payload.count({collection:'enquiries',where:{and:[{emailHash:{equals:emailHash}},{submittedAt:{greater_than:since}}]},req:tx.req,overrideAccess:false})
    if(recent.totalDocs>=3)throw new Error('Please wait before sending another enquiry')
    let postSnapshot:Record<string,unknown>|undefined
    if(postId){
      const post=await tx.payload.findByID({collection:'posts',id:postId,draft:false,depth:0,req:tx.req,overrideAccess:true})
      if(post._status!=='published'||process.env.APP_ENV==='production'&&post.synthetic)throw new Error('This event or story is unavailable')
      postSnapshot={id:post.id,title:plain(post.title),eventDate:post.eventDate||null,type:post.type}
    }
    const enquiry=await tx.payload.create({collection:'enquiries',data:{reference:'ENQ-'+randomUUID(),nonce,fingerprint,emailHash,submittedAt:ctx.clock.now(),contact,postSnapshot,state:'delivery-pending'},req:tx.req,overrideAccess:false})
    await enqueue(tx,{semanticKey:`enquiry:${enquiry.id}`,kind:'enquiry',payload:{enquiryId:enquiry.id},availableAt:ctx.clock.now()})
    await appendAudit(tx,{action:'enquiry:submitted',recordType:'enquiries',recordId:enquiry.id,outcome:'success'})
    return enquiry.id
  })
}
