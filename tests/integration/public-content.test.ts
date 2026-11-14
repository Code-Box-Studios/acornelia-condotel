import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createLocalReq} from 'payload'
import {createHarness,type TestHarness} from '../support/harness'
import {readPublicProperty} from '@/content/public-property'
import {readRoomCatalog} from '@/content/catalog'
import {createMediaStore} from '@/media/store'
import type {Principal} from '@/domain/shared/types'
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')
describe('published property content and local durable media',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  async function owner(){const user=await h.seed('staff-users',{name:'Content fixture',email:'content@example.test',password:'Synthetic-content-passphrase-824!',role:'staff'});return {user:{...user,collection:'staff-users' as const},actor:{kind:'staff',collection:'staff-users',id:user.id,role:'staff'} as Principal}}
  const input={bytes:pixel,filename:'content-fixture.png',mimeType:'image/png' as const,alt:'Synthetic one-pixel test image',source:'Integration fixture',license:'Project-created fixture',accessClass:'private' as const,synthetic:true}
  it('keeps draft-only media private and persists approved content',async()=>{
    const {user,actor}=await owner(),store=createMediaStore(h.payload)
    const image=await store.put(actor,input)
    await expect(store.read({kind:'anonymous'},image.id)).rejects.toThrow()
    const savedProperty=await h.payload.updateGlobal({slug:'property',data:{_status:'published',name:'Synthetic property',tagline:'Local preview',description:'Property fixture',hero:image.id,synthetic:true},draft:false,user,overrideAccess:false})
    const reloadedProperty=await readPublicProperty(h.payload)
    expect(reloadedProperty?.name).toBe(savedProperty.name)
    expect(reloadedProperty?.hero).toBeNull()
    await h.payload.updateGlobal({slug:'property',data:{name:'Private draft title',_status:'draft'},draft:true,user,overrideAccess:false})
    expect((await readPublicProperty(h.payload))?.name).toBe('Synthetic property')
    const freshStore=createMediaStore(h.payload)
    expect((await freshStore.read(actor,image.id)).status).toBe('ready')
    await store.remove(actor,image.id)
  })
  it('requires descriptions, source and license and rejects arbitrary uploads',async()=>{
    const {actor}=await owner(),store=createMediaStore(h.payload)
    for(const field of ['alt','source','license'] as const)await expect(store.put(actor,{...input,[field]:''})).rejects.toThrow()
    await expect(store.put({kind:'anonymous'},input)).rejects.toThrow()
    await expect(store.put(actor,{...input,mimeType:'image/svg+xml' as typeof input.mimeType})).rejects.toThrow()
    expect(await h.rows('media')).toHaveLength(0)
  })
  it('projects published room types and plain text without exposing private configuration',async()=>{
    const {user}=await owner()
    await h.payload.create({collection:'room-types',data:{_status:'published',name:'Public fixture',slug:'public-fixture',description:'<script>bad()</script>A quiet room',maxGuests:2,bedDescription:'One fixture bed',amenities:[{label:'Fixture amenity'}],privateNotes:'private operations',synthetic:true},draft:false,user,overrideAccess:false})
    await h.payload.create({collection:'room-types',data:{name:'Draft fixture',slug:'draft-fixture',description:'Private draft'},draft:true,user,overrideAccess:false})
    const rooms=await readRoomCatalog(h.payload)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].description).toBe('A quiet room')
    expect(JSON.stringify(rooms)).not.toContain('private operations')
    expect(JSON.stringify(rooms)).not.toContain('<script')
    await expect(h.payload.find({collection:'room-types',overrideAccess:false})).rejects.toThrow()
  })
  it('audits a global edit atomically and permits only the configured staff fields',async()=>{
    const {user}=await owner()
    await expect(h.payload.updateGlobal({slug:'property',data:{name:'Anonymous edit'},overrideAccess:false})).rejects.toThrow()
    await h.payload.updateGlobal({slug:'property',data:{name:'Before fixture',synthetic:true},user,overrideAccess:false})
    expect((await h.rows('audit-entries')).some(x=>x.action==='property:update')).toBe(true)
    await h.pool.query(`CREATE FUNCTION content_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected content audit failure'; END $$; CREATE TRIGGER content_audit_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION content_audit_failure();`)
    try{await expect(h.payload.updateGlobal({slug:'property',data:{name:'After fixture'},user,overrideAccess:false})).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER content_audit_failure ON audit_entries; DROP FUNCTION content_audit_failure();')}
    expect((await h.payload.findGlobal({slug:'property',overrideAccess:true})).name).toBe('Before fixture')
  })
  it('retains a private recovery record when a required delete audit fails',async()=>{
    const {actor}=await owner(),store=createMediaStore(h.payload)
    const image=await store.put(actor,{...input,accessClass:'public'})
    await h.pool.query(`CREATE FUNCTION content_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='media:delete' THEN RAISE EXCEPTION 'injected delete audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER content_delete_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION content_delete_failure();`)
    try{await expect(store.remove(actor,image.id)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER content_delete_failure ON audit_entries; DROP FUNCTION content_delete_failure();')}
    const record=await h.payload.findByID({collection:'media',id:image.id,overrideAccess:true})
    expect(record.status).toBe('failed')
    expect(record.accessClass).toBe('private')
    await expect(store.read({kind:'anonymous'},image.id)).rejects.toThrow()
    await store.remove(actor,image.id)
  })
  it('leaves a private recoverable intent when a file write fails',async()=>{
    const {actor}=await owner(),store=createMediaStore(h.payload)
    // A real image decoder rejects the invalid bytes after the durable intent exists.
    await expect(store.put(actor,{...input,bytes:Buffer.from('not an image')})).rejects.toThrow()
    const records=await h.rows('media')
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('failed')
    const req=await createLocalReq({},h.payload)
    await expect(h.payload.findByID({collection:'media',id:records[0].id,req,overrideAccess:false})).rejects.toThrow()
  })
})
