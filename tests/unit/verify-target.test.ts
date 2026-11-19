import {describe,it,expect} from 'vitest'
import {verifyTarget,type TargetConfig} from '../../scripts/verify-target'
const production={databaseProjects:['prodref123456'],appOrigins:['https://acornelia.example.ph']}
const preview:TargetConfig={appEnv:'preview',appUrl:'https://acornelia-git-main.vercel.app',databaseUrl:'postgresql://postgres.previewref9876:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',migrationDatabaseUrl:'postgresql://postgres.previewref9876:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',mayaEnvironment:'sandbox',workRunnerSecret:'x'.repeat(40),payloadSecret:'y'.repeat(48),operationMode:'normal',recoveryGeneration:'1',production}
describe('deployment target verification',()=>{
 it('rejects preview configuration pointing at production resources',()=>{
  const previewWithProductionDatabase={...preview,databaseUrl:'postgresql://postgres.prodref123456:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'}
  const previewWithProductionMaya={...preview,mayaEnvironment:'production' as const}
  expect(()=>verifyTarget(previewWithProductionDatabase)).toThrow();expect(()=>verifyTarget(previewWithProductionMaya)).toThrow()
  expect(()=>verifyTarget({...preview,appUrl:'https://acornelia.example.ph'})).toThrow()
 })
 it('accepts an isolated preview and names what it verified without echoing secrets',()=>{
  const verified=verifyTarget(preview)
  expect(verified).toEqual({appEnv:'preview',origin:'https://acornelia-git-main.vercel.app',databaseProject:'previewref9876',mayaEnvironment:'sandbox'})
  expect(JSON.stringify(verified)).not.toContain('secret')
 })
 it('rejects swapped environments, missing runner authentication and mismatched migration targets',()=>{
  for(const config of [
   {...preview,workRunnerSecret:'short'},
   {...preview,migrationDatabaseUrl:'postgresql://postgres.otherref55555:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'},
   {...preview,appEnv:'production' as const},
   {...preview,appUrl:'http://acornelia-git-main.vercel.app'},
   {...preview,payloadSecret:'short'},
   {...preview,databaseUrl:'postgresql://acornelia:secret@127.0.0.1:55432/acornelia_dev'},
  ])expect(()=>verifyTarget(config)).toThrow()
  try{verifyTarget({...preview,workRunnerSecret:'short'})}catch(error){expect(String(error)).not.toContain('short')}
 })
 it('requires production to use its own database, live Maya, its own origin and the recovery fence',()=>{
  const live:TargetConfig={...preview,appEnv:'production',appUrl:'https://acornelia.example.ph',databaseUrl:'postgresql://postgres.prodref123456:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',migrationDatabaseUrl:'postgresql://postgres.prodref123456:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',mayaEnvironment:'production'}
  expect(verifyTarget(live)).toMatchObject({appEnv:'production',databaseProject:'prodref123456',mayaEnvironment:'production'})
  for(const config of [{...live,mayaEnvironment:'sandbox' as const},{...live,databaseUrl:preview.databaseUrl,migrationDatabaseUrl:preview.migrationDatabaseUrl},{...live,appUrl:'https://acornelia-git-main.vercel.app'},{...live,operationMode:'reconcile'}])expect(()=>verifyTarget(config)).toThrow()
 })
 it('refuses hosted targets when the production registry is missing or incomplete',()=>{
  for(const registry of [{databaseProjects:[],appOrigins:[]},{databaseProjects:['prodref123456'],appOrigins:[]},{databaseProjects:[],appOrigins:['https://acornelia.example.ph']}])expect(()=>verifyTarget({...preview,production:registry})).toThrow()
  expect(verifyTarget({...preview,appEnv:'development',appUrl:'http://localhost:3042',databaseUrl:'postgresql://acornelia:secret@127.0.0.1:55432/acornelia_dev',migrationDatabaseUrl:undefined,production:{databaseProjects:[],appOrigins:[]}})).toMatchObject({appEnv:'development',databaseProject:'local'})
 })
})
