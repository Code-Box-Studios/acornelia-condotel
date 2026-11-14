import Link from 'next/link'
import {listPosts} from '@/content/posts'
import {propertyToday} from '@/domain/shared/dates'
import {PostCard} from './PostCard'
export async function UpdatesSummary(){const posts=await listPosts('all',null,propertyToday(process.env.PROPERTY_TIMEZONE||'UTC'));return posts.items.length?<div className="posts-grid">{posts.items.slice(0,3).map(post=><PostCard key={post.id} post={post}/>)}</div>:<div className="updates-empty"><div><h3>A new story is on its way.</h3><p>Published stories and upcoming events will appear here.</p></div><Link className="button secondary" href="/updates">Visit Stories & events <span aria-hidden="true">↗</span></Link></div>}
