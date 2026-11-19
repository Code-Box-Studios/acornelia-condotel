import { z } from 'zod'
export type AppEnvironment = { appEnv: 'development'|'test'|'preview'|'production'; appUrl: string; mayaEnvironment: 'sandbox'|'production'; operationMode: 'quarantine'|'reconcile'|'normal' }
export function parseEnvironment(input: Record<string,string|undefined>): AppEnvironment {
  const appEnv=z.enum(['development','test','preview','production']).parse(input.APP_ENV)
  const appUrl=z.url().parse(input.APP_URL)
  const mayaEnvironment=z.enum(['sandbox','production']).parse(input.MAYA_ENVIRONMENT || 'sandbox')
  const operationMode=z.enum(['quarantine','reconcile','normal']).parse(input.APP_OPERATION_MODE || 'quarantine')
  const url=new URL(appUrl)
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid application origin')
  if(appEnv==='production' && (url.protocol!=='https:' || ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Production requires a public HTTPS origin')
  if(appEnv!=='production' && mayaEnvironment==='production') throw new Error('Non-production cannot use production Maya')
  if(appEnv==='production' && input.DEVELOPMENT_FIXTURES==='true') throw new Error('Synthetic fixtures are forbidden in production')
  return {appEnv,appUrl:url.origin,mayaEnvironment,operationMode}
}
