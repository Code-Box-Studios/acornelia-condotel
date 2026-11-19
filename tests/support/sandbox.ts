import {verifyTarget,type TargetConfig,type VerifiedTarget} from '../../scripts/verify-target'
export type SandboxTarget={enabled:false;reason:string}|{enabled:true;target:VerifiedTarget;values:Record<string,string>}
/**
 * Sandbox tests use real provider accounts and create real sandbox records. They run only when
 * SANDBOX_AUTHORIZED=yes, every named setting is present and the target verifies as an isolated
 * preview with sandbox Maya. An authorized run that fails a check stops instead of skipping, and
 * errors never repeat configured values.
 */
export function sandboxTarget(required:string[],env:Record<string,string|undefined>=process.env):SandboxTarget{
 if(env.SANDBOX_AUTHORIZED!=='yes')return {enabled:false,reason:'Set SANDBOX_AUTHORIZED=yes to run sandbox checks against an authorized preview'}
 const missing=required.filter(name=>!env[name])
 if(missing.length)throw new Error('Sandbox checks need these settings: '+missing.join(', '))
 if(env.APP_ENV!=='preview')throw new Error('Sandbox checks run only against a preview target')
 if(env.MAYA_ENVIRONMENT!=='sandbox')throw new Error('Sandbox checks need MAYA_ENVIRONMENT=sandbox')
 let production:TargetConfig['production']
 try{production=JSON.parse(env.TARGET_PRODUCTION_REFS??'') as TargetConfig['production']}catch{throw new Error('Sandbox checks need TARGET_PRODUCTION_REFS')}
 const target=verifyTarget({appEnv:'preview',appUrl:env.APP_URL??'',databaseUrl:env.DATABASE_URL??'',migrationDatabaseUrl:env.MIGRATION_DATABASE_URL,mayaEnvironment:'sandbox',workRunnerSecret:env.WORK_RUNNER_SECRET,payloadSecret:env.PAYLOAD_SECRET,operationMode:env.APP_OPERATION_MODE,recoveryGeneration:env.APP_RECOVERY_GENERATION,production:{databaseProjects:production?.databaseProjects??[],appOrigins:production?.appOrigins??[]}})
 return {enabled:true,target,values:Object.fromEntries(required.map(name=>[name,env[name]!]))}
}
