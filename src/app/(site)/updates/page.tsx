import Link from 'next/link'
import {listPosts,type PostFilter} from '@/content/posts'
import {propertyToday} from '@/domain/shared/dates'
import {PostCard} from '@/components/PostCard'
import {Button} from '@/components/ui/button'
export const metadata={title:'Stories & events'}
export default async function Updates({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const params=await searchParams,filter:PostFilter=params.filter==='stories'||params.filter==='upcoming'?params.filter:'all'
  let page
  try{page=await listPosts(filter,params.cursor||null,propertyToday(process.env.PROPERTY_TIMEZONE||'UTC'))}catch{page=await listPosts(filter,null,propertyToday(process.env.PROPERTY_TIMEZONE||'UTC'))}
  return <main id="main" className="shell section"><header className="page-heading"><p className="eyebrow">At Acornelia</p><h1>Little moments.<br/>Lovely memories.</h1><p>Stories from here, and things to look forward to.</p></header><div className="updates-toolbar"><nav className="post-filters" aria-label="Filter stories and events">{(['all','stories','upcoming'] as const).map(value=><Link key={value} href={`/updates?filter=${value}`} aria-current={filter===value?'page':undefined}>{value==='all'?'All':value==='stories'?'Stories':'Upcoming'}</Link>)}</nav><p className="result-count">{page.total} {page.total===1?'post':'posts'}</p></div>{page.items.length?<div className="posts-grid">{page.items.map(post=><PostCard key={post.id} post={post}/>)}</div>:<section className="status-panel"><h2>{filter==='upcoming'?'A little anticipation.':'A new story is on its way.'}</h2><p>{filter==='upcoming'?'There are no upcoming events published right now. Check back for the next little happening.':'There are no published posts in this view yet.'}</p></section>}{page.nextCursor&&<div className="section"><Button asChild variant="outline"><Link href={`/updates?filter=${filter}&cursor=${encodeURIComponent(page.nextCursor)}`}>More stories & events ↗</Link></Button></div>}</main>
}
