import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {appendAudit} from '@/domain/audit/append'
import {readAudit} from '@/domain/audit/read'
import type {Principal} from '@/domain/shared/types'
const system:Principal={kind:'system',purpose:'payments'}
const entry={action:'payment:confirmed',recordType:'booking',outcome:'success' as const,safeChanges:{amountMinor:'200000',currency:'PHP'}}
describe('protected transactional action logs',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  async function developer(){return h.seed('staff-users',{name:'Developer fixture',email:'developer@example.test',password:'Synthetic-audit-passphrase-824!',role:'developer'})}
  async function failingAudit(work:()=>Promise<void>){
    await h.pool.query(`CREATE FUNCTION audit_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.outcome='success' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER audit_fixture_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION audit_fixture_failure();`)
    try{await work()}finally{await h.pool.query('DROP TRIGGER audit_fixture_failure ON audit_entries; DROP FUNCTION audit_fixture_failure();')}
  }
  it('attributes automatic events to the trusted system actor',async()=>{
    await h.uow.run(system,tx=>appendAudit(tx,entry))
    const logs=await h.rows('audit-entries')
    expect(logs).toHaveLength(1)
    expect(logs[0].actor).toEqual({kind:'system',purpose:'payments'})
  })
  it('records staff-created accounts without storing credentials or a full profile',async()=>{
    const actor=await developer()
    await h.payload.create({collection:'staff-users',data:{name:'New staff fixture',email:'new-staff@example.test',password:'Synthetic-private-secret-458!',role:'staff'},user:{...actor,collection:'staff-users'},overrideAccess:false})
    const logs=await h.rows('audit-entries')
    expect(logs.some(x=>x.action==='staff-users:create')).toBe(true)
    expect(JSON.stringify(logs)).not.toContain('Synthetic-private-secret-458!')
    expect(JSON.stringify(logs)).not.toContain('new-staff@example.test')
  })
  it('rolls back account creation if its required audit insert fails',async()=>{
    const actor=await developer()
    await failingAudit(async()=>{
      await expect(h.payload.create({collection:'staff-users',data:{name:'Refused fixture',email:'refused@example.test',password:'Synthetic-private-secret-458!',role:'staff'},user:{...actor,collection:'staff-users'},overrideAccess:false})).rejects.toThrow()
    })
    expect(await h.rows('staff-users')).toHaveLength(1)
  })
  it('rolls back a configured CMS field edit when its required log fails',async()=>{
    const actor=await developer(),room=await h.seed('rooms',{label:'Original room label'})
    await failingAudit(async()=>{
      await expect(h.payload.update({collection:'rooms',id:room.id,data:{label:'Changed room label'},user:{...actor,collection:'staff-users'},overrideAccess:false})).rejects.toThrow()
    })
    expect((await h.payload.findByID({collection:'rooms',id:room.id,overrideAccess:true})).label).toBe('Original room label')
  })
  it('denies ordinary staff and customer log reads and exports',async()=>{
    const staff=await h.seed('staff-users',{name:'Staff fixture',email:'staff@example.test',password:'Synthetic-audit-passphrase-824!',role:'staff'})
    const customer=await h.seed('customers',{name:'Customer fixture',email:'customer@example.test',password:'Synthetic-audit-passphrase-824!',_verified:true})
    await expect(h.payload.find({collection:'audit-entries',user:{...staff,collection:'staff-users'},overrideAccess:false})).rejects.toThrow()
    await expect(h.payload.count({collection:'audit-entries',user:{...customer,collection:'customers'},overrideAccess:false})).rejects.toThrow()
    await expect(readAudit(h.ctx({kind:'staff',collection:'staff-users',id:staff.id,role:'staff'}),{})).rejects.toThrow()
  })
  it('permits a developer to read the protected history',async()=>{
    const actor=await developer()
    await h.uow.run(system,tx=>appendAudit(tx,entry))
    const result=await readAudit(h.ctx({kind:'staff',collection:'staff-users',id:actor.id,role:'developer'}),{})
    expect(result.items.some(x=>x.action==='payment:confirmed')).toBe(true)
  })
  it('does not let developer API writes edit or delete old entries',async()=>{
    const actor=await developer()
    const id=await h.uow.run(system,tx=>appendAudit(tx,entry))
    const user={...actor,collection:'staff-users' as const}
    await expect(h.payload.update({collection:'audit-entries',id,data:{action:'rewritten'},user,overrideAccess:false})).rejects.toThrow()
    await expect(h.payload.delete({collection:'audit-entries',id,user,overrideAccess:false})).rejects.toThrow()
    await expect(h.pool.query('update audit_entries set action=$1 where id=$2',['rewritten',id])).rejects.toThrow()
  })
  it('validates audit safety even for privileged Local API writes outside the helper',async()=>{
    await expect(h.seed('audit-entries',{actor:system,action:'fixture:unsafe',recordType:'booking',outcome:'success',safeChanges:{token:'must-not-be-stored'}})).rejects.toThrow()
    await expect(h.seed('audit-entries',{actor:{kind:'system',purpose:'payments',password:'must-not-be-stored'},action:'fixture:unsafe',recordType:'booking',outcome:'success'})).rejects.toThrow()
    expect(await h.rows('audit-entries')).toHaveLength(0)
  })
  it('refuses audit payloads containing passwords, private tokens or guest contact profiles',async()=>{
    for(const safeChanges of [{password:'private'},{token:'private'},{contact:{name:'Guest',email:'guest@example.test'}}]){
      await expect(h.uow.run(system,tx=>appendAudit(tx,{...entry,safeChanges}))).rejects.toThrow()
    }
    expect(await h.rows('audit-entries')).toHaveLength(0)
  })
})
