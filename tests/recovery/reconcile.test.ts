import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {confirmedOperationsFixture} from '../support/operations-fixtures'
import {merchantGatewayFor} from '../support/payment-observation'
import {reconcileRestoredState} from '@/domain/recovery/reconcile'
import type {CommandContext} from '@/domain/db/types'
import type {MayaGateway} from '@/integrations/maya/types'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
it('reads merchant state for collections in the reconcile stage without sending money',async()=>{
 const f=await confirmedOperationsFixture(h,{refunds:true}),saved=process.env.APP_OPERATION_MODE,calls={money:0,reads:0},source=merchantGatewayFor(f.packet)
 const gateway:MayaGateway={...source,retrievePayment:async id=>{calls.reads++;return source.retrievePayment(id)},findPaymentsByReference:async reference=>{calls.reads++;return source.findPaymentsByReference(reference)},retrieveRefunds:async()=>{calls.reads++;return []},createCheckout:async()=>{calls.money++;return {kind:'refused',reason:'configuration'}},refundPayment:async()=>{calls.money++;return {kind:'refused',reason:'configuration'}},voidPayment:async()=>{calls.money++;return {kind:'refused',reason:'configuration'}}}
 const recovery:CommandContext={...h.ctx({kind:'system',purpose:'recovery'}),policy:f.ctx.policy}
 try{
  process.env.APP_OPERATION_MODE='normal';await expect(reconcileRestoredState(recovery,gateway)).rejects.toThrow()
  process.env.APP_OPERATION_MODE='reconcile';await expect(reconcileRestoredState({...recovery,actor:{kind:'system',purpose:'work'}},gateway)).rejects.toThrow()
  const report=await reconcileRestoredState(recovery,gateway)
  expect(report).toMatchObject({payments:1,unresolved:0});expect(calls.reads).toBeGreaterThan(0);expect(calls.money).toBe(0)
 }finally{if(saved===undefined)delete process.env.APP_OPERATION_MODE;else process.env.APP_OPERATION_MODE=saved}
})
