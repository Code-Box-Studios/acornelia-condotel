// Checks one deployment target before migrations, builds or provider tests touch it.
// Usage: TARGET_PRODUCTION_REFS='{"databaseProjects":["<ref>"],"appOrigins":["https://<domain>"]}' pnpm exec tsx scripts/verify-target.ts
export type TargetConfig={appEnv:'development'|'test'|'preview'|'production';appUrl:string;databaseUrl:string;migrationDatabaseUrl?:string;mayaEnvironment:'sandbox'|'production';workRunnerSecret?:string;payloadSecret?:string;operationMode?:string;recoveryGeneration?:string;production:{databaseProjects:string[];appOrigins:string[]}}
export type VerifiedTarget={appEnv:TargetConfig['appEnv'];origin:string;databaseProject:string;mayaEnvironment:TargetConfig['mayaEnvironment']}
/** Identifies the Supabase project behind a connection string without exposing its credentials. */
function databaseProject(value:string):string{
 let url:URL
 try{url=new URL(value)}catch{throw new Error('A database connection string is not a valid URL')}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Database connections must use PostgreSQL')
 if(['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))return 'local'
 const direct=/^db\.([a-z0-9]{6,40})\.supabase\.co$/.exec(url.hostname)
 if(direct)return direct[1]
 const pooled=url.hostname.endsWith('.pooler.supabase.com')?/^postgres\.([a-z0-9]{6,40})$/.exec(decodeURIComponent(url.username)):null
 if(pooled)return pooled[1]
 throw new Error('The database host is not a recognised Supabase project')
}
/** Refuses any target whose database, Maya mode, origin or secrets belong to another environment. Errors never repeat secret values. */
export function verifyTarget(config:TargetConfig):VerifiedTarget{
 const origin=new URL(config.appUrl),hosted=config.appEnv==='preview'||config.appEnv==='production'
 if(hosted){
  if(origin.protocol!=='https:')throw new Error('Preview and production need an HTTPS origin')
  if((config.workRunnerSecret??'').length<32)throw new Error('WORK_RUNNER_SECRET must be set with at least 32 characters')
  if((config.payloadSecret??'').length<32)throw new Error('PAYLOAD_SECRET must be set with at least 32 characters')
  // Without a registry the production checks below cannot fail, so hosted targets refuse to proceed.
  if(!config.production.databaseProjects.length||!config.production.appOrigins.length)throw new Error('TARGET_PRODUCTION_REFS must name the production database projects and origins')
 }
 const project=databaseProject(config.databaseUrl)
 if(config.migrationDatabaseUrl!==undefined&&databaseProject(config.migrationDatabaseUrl)!==project)throw new Error('The migration database belongs to a different project than the runtime database')
 const productionDatabase=config.production.databaseProjects.includes(project),productionOrigin=config.production.appOrigins.includes(origin.origin)
 if(config.appEnv==='production'){
  if(!productionDatabase)throw new Error('Production must use the registered production database')
  if(!productionOrigin)throw new Error('Production must use a registered production origin')
  if(config.mayaEnvironment!=='production')throw new Error('Production must use live Maya')
  if(config.operationMode!=='normal'||!config.recoveryGeneration)throw new Error('Release needs normal mode and an explicit recovery generation')
 }else{
  if(productionDatabase)throw new Error('A non-production target points at the production database')
  if(productionOrigin)throw new Error('A non-production target uses a production origin')
  if(config.mayaEnvironment==='production')throw new Error('A non-production target uses live Maya')
  if(config.appEnv==='preview'&&project==='local')throw new Error('Preview must use a hosted, isolated database')
 }
 return {appEnv:config.appEnv,origin:origin.origin,databaseProject:project,mayaEnvironment:config.mayaEnvironment}
}
function main(){
 const env=process.env,registry=JSON.parse(env.TARGET_PRODUCTION_REFS??'{"databaseProjects":[],"appOrigins":[]}') as TargetConfig['production']
 const verified=verifyTarget({appEnv:env.APP_ENV as TargetConfig['appEnv'],appUrl:env.APP_URL??'',databaseUrl:env.DATABASE_URL??'',migrationDatabaseUrl:env.MIGRATION_DATABASE_URL,mayaEnvironment:(env.MAYA_ENVIRONMENT??'sandbox') as TargetConfig['mayaEnvironment'],workRunnerSecret:env.WORK_RUNNER_SECRET,payloadSecret:env.PAYLOAD_SECRET,operationMode:env.APP_OPERATION_MODE,recoveryGeneration:env.APP_RECOVERY_GENERATION,production:registry})
 console.log(JSON.stringify(verified))
}
if(process.argv[1]?.endsWith('verify-target.ts')){try{main()}catch(error){console.error(error instanceof Error?error.message:'Target verification failed');process.exit(1)}}
