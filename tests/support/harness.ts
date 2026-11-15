import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {getPayload,type CollectionSlug,type RequiredDataFromCollectionSlug,type Where} from 'payload'
import {PayloadUnitOfWork} from '@/domain/db/unit-of-work'
import {propertyToday} from '@/domain/shared/dates'
import type {Principal} from '@/domain/shared/types'
import type {CommandContext} from '@/domain/db/types'
import {syntheticPolicy} from './policies'
import {ownedPostgresDriver} from './owned-pg'
type SeedInput<C extends CollectionSlug>=C extends 'customers'?Omit<RequiredDataFromCollectionSlug<C>,'securityRevision'>&{securityRevision?:number}:RequiredDataFromCollectionSlug<C>
export async function createHarness(options:{databaseUrl?:string;migrate?:boolean}={}){
  const value=options.databaseUrl||process.env.TEST_DATABASE_URL
  if(!value)throw new Error('An isolated TEST_DATABASE_URL is required')
  const url=new URL(value)
  if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/acornelia(?:_[a-z0-9]+)?_test$/.test(url.pathname)||url.port!=='55432'||process.env.APP_ENV!=='test')throw new Error('Refusing a non-isolated test database')
  process.env.DATABASE_URL=value
  const pool=new pg.Pool({connectionString:value,max:8})
  const identity=await pool.query('select current_database() as name')
  if(identity.rows[0].name!==url.pathname.slice(1))throw new Error('Test database identity mismatch')
  const owned=ownedPostgresDriver()
  const config=(await import('@payload-config')).createPayloadConfig(value,owned.driver)
  const payload=await getPayload({config,key:`proof-${randomUUID()}`})
  if(options.migrate!==false)await payload.db.migrate()
  let instant='2026-11-13T04:00:00.000Z'
  const clock={now:()=>instant,today:(tz:string)=>propertyToday(tz,new Date(instant)),set:(value:string)=>{instant=value}}
  const uow=new PayloadUnitOfWork(payload)
  return {
    payload,pool,clock,uow,
    ctx(actor:Principal):CommandContext{return {actor,clock,uow,policy:syntheticPolicy(),requestId:randomUUID()}},
    async seed<C extends CollectionSlug>(collection:C,data:SeedInput<C>){const seeded={...(collection==='customers'?{securityRevision:1}:{}),...data} as RequiredDataFromCollectionSlug<C>;return payload.create({collection,data:seeded,disableVerificationEmail:true,overrideAccess:true})},
    async rows<C extends CollectionSlug>(collection:C,where:Where={}){return (await payload.find({collection,where,limit:1000,depth:0,overrideAccess:true})).docs},
    async reset(){
      const tables=await pool.query("select tablename from pg_tables where schemaname='public' and tablename<>'payload_migrations'")
      const quoted=tables.rows.map((r:{tablename:string})=>'"'+r.tablename.replaceAll('"','""')+'"').join(',')
      if(quoted)await pool.query('TRUNCATE TABLE '+quoted+' CASCADE')
    },
    async close(){await payload.destroy();await owned.close();await pool.end()},
  }
}
export type TestHarness=Awaited<ReturnType<typeof createHarness>>
