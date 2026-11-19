import {describe,expect,it} from 'vitest'
import {sandboxTarget} from '../support/sandbox'
// Calls the preview deployment's work runner. Nothing here runs without SANDBOX_AUTHORIZED=yes.
// Set VERCEL_AUTOMATION_BYPASS_SECRET when the preview uses Vercel deployment protection.
const sandbox=sandboxTarget(['WORK_RUNNER_SECRET'])
const call=(authorization?:string)=>{
 if(!sandbox.enabled)throw new Error('Sandbox checks are not authorized')
 const headers:Record<string,string>={'content-type':'application/json',...(authorization?{authorization}:{}),...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{})}
 return fetch(sandbox.target.origin+'/api/internal/work',{method:'POST',headers,body:JSON.stringify({maxJobs:1}),redirect:'manual'})
}
describe.skipIf(!sandbox.enabled)('preview work runner',()=>{
 it('refuses missing or wrong runner credentials and accepts the preview secret',async()=>{
  if(!sandbox.enabled)return
  // The application's own refusal, not a platform protection page, must answer.
  for(const authorization of [undefined,'Bearer not-the-runner-secret-000000000000000'])expect(await (await call(authorization)).json()).toEqual({error:'Runner authentication required.'})
  expect((await call('Bearer '+sandbox.values.WORK_RUNNER_SECRET)).status).toBe(200)
 })
 it.todo('records the real scheduler cadence and overlap behaviour from platform logs (scheduler choice is part of Decision 10)')
})
