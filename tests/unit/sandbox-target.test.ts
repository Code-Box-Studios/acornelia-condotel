import {describe,it,expect} from 'vitest'
import {sandboxTarget} from '../support/sandbox'
const authorized={
 SANDBOX_AUTHORIZED:'yes',APP_ENV:'preview',APP_URL:'https://acornelia-git-main.vercel.app',MAYA_ENVIRONMENT:'sandbox',
 DATABASE_URL:'postgresql://postgres.previewref9876:secret-database-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
 WORK_RUNNER_SECRET:'synthetic-preview-runner-secret-0000000000',PAYLOAD_SECRET:'synthetic-preview-payload-secret-000000000',
 TARGET_PRODUCTION_REFS:JSON.stringify({databaseProjects:['prodref123456'],appOrigins:['https://acornelia.example.ph']}),
 MAYA_PUBLIC_KEY:'pk-synthetic-sandbox-public',MAYA_SECRET_KEY:'sk-synthetic-sandbox-secret',
}
const keys=['MAYA_PUBLIC_KEY','MAYA_SECRET_KEY']
describe('sandbox target gate',()=>{
 it('stays off unless real provider use is explicitly authorized',()=>{
  expect(sandboxTarget(keys,{...authorized,SANDBOX_AUTHORIZED:undefined}).enabled).toBe(false)
  expect(sandboxTarget(keys,{...authorized,SANDBOX_AUTHORIZED:'true'}).enabled).toBe(false)
 })
 it('refuses an authorized run aimed at production resources, live Maya or a non-preview target',()=>{
  for(const env of [
   {...authorized,DATABASE_URL:'postgresql://postgres.prodref123456:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'},
   {...authorized,MAYA_ENVIRONMENT:'production'},
   {...authorized,APP_URL:'https://acornelia.example.ph'},
   {...authorized,APP_ENV:'production'},
   {...authorized,APP_ENV:'development',APP_URL:'http://localhost:3042',DATABASE_URL:'postgresql://acornelia:secret@127.0.0.1:55432/acornelia_dev'},
   {...authorized,TARGET_PRODUCTION_REFS:undefined},
  ])expect(()=>sandboxTarget(keys,env)).toThrow()
 })
 it('names missing provider settings without repeating configured secrets',()=>{
  let message=''
  try{sandboxTarget(keys,{...authorized,MAYA_SECRET_KEY:undefined})}catch(error){message=String(error)}
  expect(message).toContain('MAYA_SECRET_KEY')
  for(const value of [authorized.MAYA_PUBLIC_KEY,'secret-database-password',authorized.WORK_RUNNER_SECRET])expect(message).not.toContain(value)
 })
 it('enables a verified preview sandbox target',()=>{
  const target=sandboxTarget(keys,authorized)
  expect(target).toMatchObject({enabled:true,target:{appEnv:'preview',origin:'https://acornelia-git-main.vercel.app',databaseProject:'previewref9876',mayaEnvironment:'sandbox'}})
  expect(target.enabled&&target.values.MAYA_SECRET_KEY).toBe(authorized.MAYA_SECRET_KEY)
 })
})
