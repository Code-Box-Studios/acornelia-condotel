import {headers} from 'next/headers'
import {notFound} from 'next/navigation'
import {requestContext} from '@/features/auth/context'
import {readPostPreview} from '@/content/posts'
import {PostDetail} from '@/components/PostDetail'
export const metadata={title:'Private post preview',robots:{index:false,follow:false}}
export default async function Preview({params}:{params:Promise<{id:string}>}){const {id}=await params;const ctx=await requestContext(new Request(process.env.APP_URL||'http://localhost:3042',{headers:await headers()}));if(ctx.actor.kind!=='staff')notFound();let post;try{post=await readPostPreview(ctx,id)}catch{notFound()}return <PostDetail post={post} preview/>}
