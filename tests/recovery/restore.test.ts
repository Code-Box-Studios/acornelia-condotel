import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {confirmedOperationsFixture} from '../support/operations-fixtures'
import {createBookingView} from '@/features/booking/view-access'
import {runWorkBatch} from '@/integrations/work-runner'
import {dispatchCheckout} from '@/domain/payments/create-checkout'
import {dispatchRefund} from '@/domain/refunds/dispatch'
import {authorizeResumption,signResumptionEvidence} from '@/domain/recovery/resume'
import {applyAccountLifecycle} from '@/domain/privacy/lifecycle'
import {requestCustomerRecovery} from '@/features/auth/actions'
import {POST as identity} from '@/app/api/identity/customer/[action]/route'
import {POST as bookingView} from '@/app/api/booking/view/route'
import type {CommandContext} from '@/domain/db/types'
import type {MayaGateway} from '@/integrations/maya/types'
const base=new URL(process.env.TEST_DATABASE_URL!),testName=base.pathname.slice(1),password='Synthetic-dispatch-passphrase-946!',key='synthetic-recovery-operator-key-0123456789abcdef'
async function admin(sql:string,values:unknown[]=[]){const url=new URL(base);url.pathname='/postgres';const client=new pg.Client({connectionString:url.toString()});await client.connect();try{return (await client.query(sql,values)).rows}finally{await client.end()}}
const exists=async(name:string)=>(await admin('SELECT 1 FROM pg_database WHERE datname=$1',[name])).length>0
function counting(count:()=>void):MayaGateway{
 const refused={kind:'refused' as const,reason:'configuration' as const}
 return {createCheckout:async()=>{count();return refused},retrievePayment:async()=>{throw new Error('No reads in this fixture')},findPaymentsByReference:async()=>[],voidPayment:async()=>{count();return refused},refundPayment:async()=>{count();return refused}}
}
it('fences old credentials money work and private links after restore',async()=>{
 const suffix=randomUUID().replaceAll('-','').slice(0,10),backup=testName+'_backup_'+suffix,live=testName+'_live_'+suffix,saved={mode:process.env.APP_OPERATION_MODE,generation:process.env.APP_RECOVERY_GENERATION,key:process.env.RECOVERY_OPERATOR_KEY}
 let h:TestHarness|undefined=await createHarness()
 try{
  await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')
  const f=await confirmedOperationsFixture(h,{customer:true,role:'developer',lifecycle:{selfService:{deactivate:true,anonymize:true},staffRoles:['developer'],staffRemoval:true}}),link=await h.uow.run({kind:'system',purpose:'payments'},tx=>createBookingView(tx,f.booking.id,'2026-12-31T00:00:00.000Z'))
  expect((await h.rows('work-items',{state:{equals:'ready'}})).length).toBeGreaterThan(0)
  const frontPassword='Synthetic-front-desk-recovery-946!',front=await h.seed('staff-users',{name:'Front desk removed later',email:'front-removed@example.test',password:frontPassword,role:'staff'})
  const other=await h.seed('customers',{name:'Deleted later',email:'deleted-later@example.test',password,_verified:true})
  await h.close();h=undefined
  await admin(`CREATE DATABASE "${backup}" TEMPLATE "${testName}"`)
  h=await createHarness()
  await h.payload.update({collection:'customers',id:f.customer.id,data:{password:'Synthetic-changed-after-backup-946!'},overrideAccess:true})
  await h.pool.query('UPDATE booking_views SET revoked_at=now() WHERE id=$1',[link.id])
  const liveCtx:CommandContext={...f.ctx,uow:h.uow,clock:h.clock}
  await applyAccountLifecycle(liveCtx,front.id,1,{kind:'remove-staff',reason:'left-the-property'})
  await applyAccountLifecycle(liveCtx,f.customer.id,1,{kind:'change-email',email:'moved-after-backup@example.test',evidenceReference:'synthetic-identity-check'})
  await applyAccountLifecycle(liveCtx,other.id,1,{kind:'anonymize',reason:'customer-request'})
  await h.close();h=undefined
  await admin(`ALTER DATABASE "${testName}" RENAME TO "${live}"`);await admin(`ALTER DATABASE "${backup}" RENAME TO "${testName}"`)
  process.env.APP_OPERATION_MODE='normal';process.env.APP_RECOVERY_GENERATION='restore-2';process.env.RECOVERY_OPERATOR_KEY=key
  const json={origin:process.env.APP_URL!,'content-type':'application/json'}
  const login=()=>identity(new Request(process.env.APP_URL+'/api/identity/customer/login',{method:'POST',headers:json,body:JSON.stringify({email:f.customer.email,password})}),{params:Promise.resolve({action:'login'})})
  const view=()=>bookingView(new Request(process.env.APP_URL+'/api/booking/view',{method:'POST',headers:json,body:JSON.stringify(link)}))
  const restoredLogin=await login(),restoredPrivateLink=await view()
  expect(restoredLogin.status).toBe(503);expect(restoredPrivateLink.status).toBe(503)
  h=await createHarness()
  let outboundMoneyCalls=0,outboundEmailCalls=0
  const gateway=counting(()=>outboundMoneyCalls++),worker:CommandContext={...h.ctx({kind:'system',purpose:'work'}),policy:f.ctx.policy}
  const handlers={'create-checkout':{execute:(c:CommandContext,l:Parameters<typeof dispatchCheckout>[1],s:AbortSignal)=>dispatchCheckout(c,l,gateway,s)},refund:{execute:(c:CommandContext,l:Parameters<typeof dispatchRefund>[1],s:AbortSignal)=>dispatchRefund(c,l,gateway,s)},email:{execute:async()=>{outboundEmailCalls++;return {state:'done' as const}}}}
  await expect(runWorkBatch(worker,handlers)).rejects.toThrow()
  expect(outboundMoneyCalls).toBe(0);expect(outboundEmailCalls).toBe(0)
  const recovery:CommandContext={...h.ctx({kind:'system',purpose:'recovery'}),policy:f.ctx.policy}
  const evidence={generation:'restore-2',operator:'Synthetic recovery operator',operatorStaffEmail:f.staff.email,backupTakenAt:'2026-11-16T04:00:00.000Z',restoredAt:'2026-11-16T06:00:00.000Z',providerReconciliation:'completed' as const,postBackupReview:'completed' as const,measuredRecoveryMinutes:120,approvedTargetMinutes:240}
  await expect(authorizeResumption(recovery,{...evidence,signature:signResumptionEvidence(evidence,key)})).rejects.toThrow()
  process.env.APP_OPERATION_MODE='reconcile'
  await expect(authorizeResumption(recovery,{...evidence,signature:signResumptionEvidence({...evidence,operator:'Someone else'},key)})).rejects.toThrow()
  const permit=await authorizeResumption(recovery,{...evidence,signature:signResumptionEvidence(evidence,key)})
  expect(permit).toMatchObject({generation:'restore-2',operator:'Synthetic recovery operator'})
  process.env.APP_OPERATION_MODE='normal'
  expect((await login()).status).toBe(401);expect((await view()).status).toBe(401)
  const account=(collection:'customers'|'staff-users',id:string)=>h!.payload.findByID({collection,id,overrideAccess:true,showHiddenFields:true})
  for(const [collection,id] of [['staff-users',front.id],['customers',f.customer.id],['customers',other.id]] as const)expect(await account(collection,id)).toMatchObject({deactivated:true,recoveryHoldAt:expect.any(String)})
  expect((await account('staff-users',f.staff.id)).deactivated).toBe(false)
  await expect(h.payload.login({collection:'staff-users',data:{email:front.email,password:frontPassword}})).rejects.toThrow()
  const deliveries=(await h.rows('auth-deliveries')).length
  await requestCustomerRecovery({...h.ctx({kind:'anonymous'}),policy:f.ctx.policy},f.customer.email)
  expect(await h.rows('auth-deliveries')).toHaveLength(deliveries)
  expect(await h.rows('work-items',{and:[{state:{in:['ready','leased']}},{kind:{in:['create-checkout','refund','email','enquiry']}}]})).toHaveLength(0)
  await runWorkBatch(worker,handlers).catch(()=>null)
  expect(outboundMoneyCalls).toBe(0);expect(outboundEmailCalls).toBe(0)
 }finally{
  process.env.APP_OPERATION_MODE=saved.mode;process.env.APP_RECOVERY_GENERATION=saved.generation;process.env.RECOVERY_OPERATOR_KEY=saved.key
  if(saved.mode===undefined)delete process.env.APP_OPERATION_MODE;if(saved.generation===undefined)delete process.env.APP_RECOVERY_GENERATION;if(saved.key===undefined)delete process.env.RECOVERY_OPERATOR_KEY
  await h?.close()
   // Never leave the shared test database name missing, whatever step failed.
  if(!await exists(testName)&&await exists(live))await admin(`ALTER DATABASE "${live}" RENAME TO "${testName}"`)
  else if(!await exists(testName)&&await exists(backup))await admin(`ALTER DATABASE "${backup}" RENAME TO "${testName}"`)
  for(const name of [live,backup])if(name!==testName&&await exists(name))await admin(`DROP DATABASE "${name}" WITH (FORCE)`)
 }
},180000)
