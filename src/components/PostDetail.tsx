import Image from 'next/image'
import Link from 'next/link'
import type {PublicPost} from '@/content/posts'
import {EnquiryForm} from './EnquiryForm'
import {editorialDate} from './PostCard'
export function PostDetail({post,preview=false}:{post:PublicPost;preview?:boolean}){return <main id="main" className="shell section"><Link href="/updates" className="eyebrow">← Stories & events</Link>{preview&&<aside className="preview-note">Private staff preview · This draft is not public</aside>}<article className="post-detail"><header className="page-heading"><p className="eyebrow">{post.type==='event'?'Event':'Story'}{post.eventDate?' · '+editorialDate(post.eventDate):''}</p><h1>{post.title}</h1><p>{post.summary}</p></header>{post.cover&&<div className="detail-hero"><Image src={post.cover.url} alt={post.cover.alt} fill loading="eager" sizes="100vw" unoptimized/></div>}<div className="post-prose">{post.body.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div></article>{post.type==='event'&&!preview&&<section className="event-enquiry"><EnquiryForm postId={post.id} title={post.title}/></section>}</main>}
