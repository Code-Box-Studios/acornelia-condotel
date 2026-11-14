import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {createMediaStore} from '@/media/store'
import {listPosts,readPublishedPost,submitEnquiry} from '@/content/posts'
const contact={name:'Enquiry fixture',email:'enquiry@example.test',message:'A synthetic event enquiry.',consent:true as const}
describe('persistent Stories, Events and enquiries',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  async function published(data:Record<string,unknown>={}){return h.seed('posts',{title:'Public story fixture',slug:'public-'+randomUUID(),type:'story',summary:'Public summary fixture',body:'Full public body fixture',_status:'published',...data})}
  it('withdraws public detail and uses the property date boundary',async()=>{
    const todayEvent=await published({type:'event',eventDate:'2026-11-14'})
    const past=await published({type:'event',eventDate:'2026-11-13'})
    await published({type:'story'})
    h.clock.set('2026-11-13T16:00:00.000Z')
    const today=h.clock.today('Asia/Manila')
    expect(today).toBe('2026-11-14')
    const upcoming=await listPosts('upcoming',null,today,h.payload)
    expect(upcoming.items.map(p=>p.id)).toContain(todayEvent.id)
    expect(upcoming.items.map(p=>p.id)).not.toContain(past.id)
    expect((await listPosts('all',null,today,h.payload)).total).toBe(3)
    expect((await listPosts('stories',null,today,h.payload)).total).toBe(1)
    expect((await listPosts('upcoming',null,'2026-11-15',h.payload)).total).toBe(0)
    await h.payload.update({collection:'posts',id:todayEvent.id,data:{_status:'draft'},draft:false,overrideAccess:true})
    expect(await readPublishedPost(todayEvent.slug,h.payload)).toBeNull()
    expect((await listPosts('all',null,today,h.payload)).total).toBe(2)
  })
  it('keeps draft edits private, sanitizes public copy and validates publication fields',async()=>{
    const post=await published({title:'<script>unsafe()</script>A safe title',body:'<img src=x onerror=bad()>Full readable body'})
    expect((await readPublishedPost(post.slug,h.payload))?.title).toBe('A safe title')
    expect((await readPublishedPost(post.slug,h.payload))?.body).toBe('Full readable body')
    await h.payload.update({collection:'posts',id:post.id,data:{title:'Private draft revision',_status:'draft'},draft:true,overrideAccess:true})
    expect((await readPublishedPost(post.slug,h.payload))?.title).toBe('A safe title')
    await expect(h.payload.findByID({collection:'posts',id:post.id,draft:true,overrideAccess:false})).rejects.toThrow()
    await expect(h.seed('posts',{type:'event',title:'Incomplete event',slug:'incomplete-event',_status:'published'})).rejects.toThrow()
    await expect(h.seed('posts',{title:'',slug:'blank-draft',type:'story',_status:'draft'})).rejects.toThrow()
    const draft=await h.seed('posts',{title:'Draft fixture',slug:'private-draft',type:'story',_status:'draft'})
    expect(await readPublishedPost(draft.slug,h.payload)).toBeNull()
  })
  it('requires explicit public media before publishing a cover',async()=>{
    const staff=await h.seed('staff-users',{name:'Publication fixture',email:'publication@example.test',password:'Synthetic-publication-passphrase-984!',role:'staff'})
    const user={...staff,collection:'staff-users' as const},actor={kind:'staff' as const,collection:'staff-users' as const,id:staff.id,role:'staff' as const},store=createMediaStore(h.payload)
    const image=await store.put(actor,{bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64'),filename:'publication-fixture.png',mimeType:'image/png',alt:'Publication fixture pixel',source:'Integration fixture',license:'Project-created fixture',accessClass:'private',synthetic:true})
    try{
      const post=await h.payload.create({collection:'posts',data:{title:'Private cover fixture',slug:'private-cover-fixture',type:'story',summary:'A fixture summary.',body:'A full fixture body.',cover:image.id,_status:'draft'},draft:true,user,overrideAccess:false})
      await expect(h.payload.update({collection:'posts',id:post.id,data:{_status:'published'},user,overrideAccess:false})).rejects.toThrow('ready public image')
      expect(await readPublishedPost(post.slug,h.payload)).toBeNull()
      await h.payload.update({collection:'media',id:image.id,data:{accessClass:'public'},user,overrideAccess:false})
      await h.payload.update({collection:'posts',id:post.id,data:{_status:'published'},user,overrideAccess:false})
      expect((await readPublishedPost(post.slug,h.payload))?.cover?.alt).toBe('Publication fixture pixel')
    }finally{await store.remove(actor,image.id)}
  })
  it('excludes local sample posts from production projections',async()=>{
    const sample=await published({synthetic:true})
    try{
      vi.stubEnv('APP_ENV','production')
      expect(await readPublishedPost(sample.slug,h.payload)).toBeNull()
      expect((await listPosts('all',null,'2026-11-14',h.payload)).total).toBe(0)
    }finally{vi.unstubAllEnvs()}
  })
  it('orders All by publication date and paginates without exposing drafts',async()=>{
    for(let i=0;i<14;i++)await published({slug:`page-${String(i).padStart(2,'0')}`})
    const first=await listPosts('all',null,'2026-11-14',h.payload)
    expect(first.total).toBe(14)
    expect(first.items).toHaveLength(12)
    const second=await listPosts('all',first.nextCursor,'2026-11-14',h.payload)
    expect(second.items).toHaveLength(2)
    expect(new Set([...first.items,...second.items].map(p=>p.id)).size).toBe(14)
    const dates=first.items.map(p=>p.publishedAt!)
    expect(dates).toEqual([...dates].sort().reverse())
  })
  it('snapshots an enquiry once and queues delivery without allocating a room or taking money',async()=>{
    const post=await published({type:'event',eventDate:'2026-11-14'}),nonce=randomUUID()
    const input={...contact,nonce,postId:post.id}
    const id=await submitEnquiry(h.ctx({kind:'anonymous'}),input)
    expect(await submitEnquiry(h.ctx({kind:'anonymous'}),input)).toBe(id)
    await h.payload.update({collection:'posts',id:post.id,data:{title:'Later title'},overrideAccess:true})
    const records=await h.rows('enquiries')
    expect(records).toHaveLength(1)
    expect(records[0].postSnapshot).toMatchObject({title:post.title,eventDate:'2026-11-14'})
    expect(await h.rows('work-items')).toHaveLength(1)
    for(const collection of ['bookings','allocations','payment-attempts','payment-transactions'] as const)expect(await h.rows(collection)).toHaveLength(0)
    expect(JSON.stringify(await h.rows('audit-entries'))).not.toContain(contact.email)
    await expect(submitEnquiry(h.ctx({kind:'anonymous'}),{...input,message:'Different replay'})).rejects.toThrow()
  })
  it('bounds concurrent submissions and rejects missing consent',async()=>{
    await expect(submitEnquiry(h.ctx({kind:'anonymous'}),{...contact,nonce:randomUUID(),consent:false as true})).rejects.toThrow()
    const results=await Promise.allSettled(Array.from({length:4},()=>submitEnquiry(h.ctx({kind:'anonymous'}),{...contact,nonce:randomUUID()})))
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(3)
    expect(await h.rows('enquiries')).toHaveLength(3)
    expect(await h.rows('work-items')).toHaveLength(3)
  })
  it('rolls back enquiry and delivery work when its required audit fails',async()=>{
    await h.pool.query(`CREATE FUNCTION enquiry_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected enquiry audit failure'; END $$; CREATE TRIGGER enquiry_audit_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION enquiry_audit_failure();`)
    try{await expect(submitEnquiry(h.ctx({kind:'anonymous'}),{...contact,nonce:randomUUID()})).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER enquiry_audit_failure ON audit_entries; DROP FUNCTION enquiry_audit_failure();')}
    expect(await h.rows('enquiries')).toHaveLength(0)
    expect(await h.rows('work-items')).toHaveLength(0)
  })
})
