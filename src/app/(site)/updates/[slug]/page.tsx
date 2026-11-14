import {notFound} from 'next/navigation'
import {readPublishedPost} from '@/content/posts'
import {PostDetail} from '@/components/PostDetail'
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params,post=await readPublishedPost(slug);return {title:post?.title||'Post not found',description:post?.summary}}
export default async function Update({params}:{params:Promise<{slug:string}>}){const {slug}=await params,post=await readPublishedPost(slug);if(!post)notFound();return <PostDetail post={post}/>}
