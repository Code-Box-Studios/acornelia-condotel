import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {signedObservation,merchantGatewayFor} from '../support/payment-observation'
import {applyPaymentObservation} from '@/domain/payments/observe'
import {cancelBooking} from '@/domain/changes/cancel'
import {opaqueSecret,privateDigest} from '@/domain/security/private-state'
import {authorizeRefund} from '@/domain/refunds/authorize'
import {readRefundCapacity} from '@/domain/refunds/capacity'
import {reconcilePaymentRefunds,reconcileRefund,reconcileRefundWork} from '@/domain/refunds/reconcile'
import {workHandlersFor} from '@/integrations/work-handlers'
import {attestOfflineReimbursement,reviewOfflineReimbursement} from '@/domain/refunds/offline'
import {resolveUncertainRefund} from '@/domain/refunds/resolve'
import {withdrawRefund} from '@/domain/refunds/withdraw'
import {checkPaymentRefunds} from '@/domain/refunds/check'
import {invalidateRestoredCapabilities} from '@/domain/recovery/reconcile'
import {dispatchRefund} from '@/domain/refunds/dispatch'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import type {RefundInput} from '@/domain/refunds/types'
import type {CommandContext} from '@/domain/db/types'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(refunds:NonNullable<Parameters<typeof checkoutFixture>[1]>['refunds']={},checked=true){
 const f=await checkoutFixture(h,{refunds,changes:{},nightMinor:'100000'}),worker={...f.worker,actor:{kind:'system' as const,purpose:'payments' as const}},attempt=(await h.rows('payment-attempts'))[0]
 const packet={id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'2000.00',currency:'PHP',paymentAt:h.clock.now(),fundSource:{type:'card'},canRefund:true,canVoid:true}
 expect((await applyPaymentObservation(worker,await signedObservation(worker,packet))).state).toBe('confirmed')
 const staff=await h.seed('staff-users',{name:'Refund operator fixture',email:'refund-operator@example.test',password:'Synthetic-refund-operator-passphrase-946!',role:'developer'}),ctx:CommandContext={...f.ctx,browserKey:opaqueSecret(),actor:{kind:'staff',collection:'staff-users',id:staff.id,role:staff.role}}
 await cancelBooking(ctx,f.receipt.bookingId,1,{agreementReference:'synthetic-reviewed-cancellation',reason:'Guest requested cancellation'})
 h.clock.set('2026-11-17T04:00:00.000Z')
 const payment=(await h.rows('payment-transactions'))[0]
 if(checked)await reconcilePaymentRefunds(worker,payment.id,{...merchantGatewayFor(packet),retrieveRefunds:async()=>[]})
 const input:RefundInput={commandKey:randomUUID(),paymentId:payment.id,expectedRevision:2,amount:{minor:'50000',currency:'PHP'},method:'refund',reason:'guest-cancellation',evidenceReference:'synthetic-reviewed-payer-and-refund-authority'}
 return {...f,worker,ctx,staff,payment,packet,input}
}
it('counts uncertain refund capacity once and blocks duplicate repayment',async()=>{
 const f=await setup(),providerId=randomUUID()
 await h.seed('refund-operations',{commandKey:'provider:sandbox:'+providerId,fingerprint:privateDigest(providerId),origin:'provider',booking:f.receipt.bookingId,payment:f.payment.id,expectedRevision:2,method:'refund',state:'completed',amountMinor:'50000',currency:'PHP',reason:'manual-review',providerEnvironment:'sandbox',providerOperationId:providerId,providerStatus:'SUCCESS',actualAmountMinor:'50000',actualCurrency:'PHP',resultProof:{version:1,source:'merchant-get',id:providerId,paymentId:f.payment.providerPaymentId,status:'SUCCESS',amount:{minor:'50000',currency:'PHP'}},observedAt:h.clock.now(),completedAt:h.clock.now(),dispatchGeneration:0,reconcileSequence:0})
 const promise=authorizeRefund(f.ctx,f.input);await expect(promise).resolves.toMatchObject({state:'authorized',amountMinor:'50000'});const operation=await promise
 const worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 let providerRefundCalls=0
 const gateway={...merchantGatewayFor(f.packet),refundPayment:async(request:{operationId:string;paymentId:string})=>{providerRefundCalls++;return {kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId}}}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,gateway))
 const remaining=await readRefundCapacity(f.ctx,f.payment.id)
 expect(remaining.minor).toBe('100000');await expect(authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID(),amount:{minor:'100001',currency:'PHP'}})).rejects.toThrow();expect(providerRefundCalls).toBe(1)
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('uncertain')
})
it('serializes competing refund reservations against the same actual collection',async()=>{
 const f=await setup(),results=await Promise.allSettled([authorizeRefund(f.ctx,{...f.input,amount:{minor:'150000',currency:'PHP'}}),authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID(),amount:{minor:'150000',currency:'PHP'}})])
 expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(1);expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('50000')
 expect(await h.rows('work-items',{kind:{equals:'refund'}})).toHaveLength(1)
})
it('reuses the same refund intent without permitting a changed amount or duplicate work',async()=>{
 const f=await setup(),one=await authorizeRefund(f.ctx,f.input),two=await authorizeRefund(f.ctx,f.input)
 expect(two.id).toBe(one.id);await expect(authorizeRefund(f.ctx,{...f.input,amount:{minor:'49999',currency:'PHP'}})).rejects.toThrow()
 expect(await h.rows('refund-operations')).toHaveLength(1);expect(await h.rows('work-items',{kind:{equals:'refund'}})).toHaveLength(1)
})
it('denies customer authority, stale revisions and zero or excessive money',async()=>{
 const f=await setup()
 for(const actor of [{kind:'anonymous' as const},{kind:'customer' as const,collection:'customers' as const,id:f.customer.id}])await expect(authorizeRefund({...f.ctx,actor},f.input)).rejects.toThrow()
 for(const input of [{...f.input,expectedRevision:1},{...f.input,amount:{minor:'0',currency:'PHP'}},{...f.input,amount:{minor:'200001',currency:'PHP'}}])await expect(authorizeRefund(f.ctx,input)).rejects.toThrow()
 expect(await h.rows('refund-operations')).toHaveLength(0)
})
it('rolls a refund reservation and work intent back if the required log fails',async()=>{
 const f=await setup();await h.pool.query("CREATE FUNCTION refund_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='refund:authorized' THEN RAISE EXCEPTION 'injected refund audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER refund_audit_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION refund_audit_failure()")
 try{await expect(authorizeRefund(f.ctx,f.input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER refund_audit_failure ON audit_entries; DROP FUNCTION refund_audit_failure()')}
 expect(await h.rows('refund-operations')).toHaveLength(0);expect(await h.rows('work-items',{kind:{equals:'refund'}})).toHaveLength(0)
})

it('imports external merchant refunds once before reserving further repayment',async()=>{
 const f=await setup(),id=randomUUID(),source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id,paymentId:f.packet.id,status:'SUCCESS',amount:{minor:'50000',currency:'PHP'},reason:'External dashboard operation'}]}
 await expect(reconcilePaymentRefunds(f.worker,f.payment.id,source)).resolves.toMatchObject({state:'reconciled'})
 await reconcilePaymentRefunds(f.worker,f.payment.id,source)
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 expect(await h.rows('refund-operations',{providerOperationId:{equals:id}})).toHaveLength(1)
 await expect(authorizeRefund(f.ctx,{...f.input,amount:{minor:'150001',currency:'PHP'}})).rejects.toThrow()
})
it('never assumes an empty merchant lookup means an uncertain request failed',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 let calls=0;const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[],refundPayment:async(request:{operationId:string;paymentId:string})=>{calls++;return {kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId}}}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source))
 await expect(reconcileRefund(f.worker,operation.id,source)).resolves.toMatchObject({state:'uncertain'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000');expect(calls).toBe(1)
})
it('does not correlate an unknown request using only equal money or its reason marker',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id:randomUUID(),paymentId:f.packet.id,status:'SUCCESS',amount:{minor:'50000',currency:'PHP'},reason:'ACN '+operation.id+' guest-cancellation'}],refundPayment:async(request:{operationId:string;paymentId:string})=>({kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId})}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source))
 await expect(reconcileRefund(f.worker,operation.id,source)).resolves.toMatchObject({state:'uncertain'})
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].providerOperationId??null).toBeNull()
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('100000')
})
it('preserves refund evidence history when provider facts change and never erases an actual return',async()=>{
 const f=await setup(),id=randomUUID();let status='FAILED'
 const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id,paymentId:f.packet.id,status,amount:{minor:'50000',currency:'PHP'},reason:null}]}
 await expect(reconcilePaymentRefunds(f.worker,f.payment.id,source)).resolves.toMatchObject({state:'reconciled'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('200000')
 status='SUCCESS';await reconcilePaymentRefunds(f.worker,f.payment.id,source);expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 status='FAILED';await reconcilePaymentRefunds(f.worker,f.payment.id,source);expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 expect(await h.rows('refund-evidence',{providerOperationId:{equals:id}})).toHaveLength(2)
})
it('retains an owned provider receipt when the original worker completion becomes stale',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const id=randomUUID();let calls=0
 const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id,paymentId:f.packet.id,status:'SUCCESS',amount:{minor:'50000',currency:'PHP'},reason:null}],refundPayment:async(request:{paymentId:string;amount:{minor:string;currency:string}})=>{calls++;return {kind:'verified' as const,environment:'sandbox' as const,id,paymentId:request.paymentId,status:'SUCCESS' as const,amount:request.amount}}}
 const result=await dispatchRefund(worker,lease,source)
 h.clock.set(new Date(Date.parse(lease.expiresAt)+1).toISOString())
 await expect(completeWork(worker,lease,result)).rejects.toThrow('Work lease is stale')
 expect(await h.rows('refund-evidence',{source:{equals:'merchant-post'}})).toHaveLength(1)
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('dispatching')
 expect((await reconcileRefund(f.worker,operation.id,source)).state).toBe('completed')
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000');expect(calls).toBe(1)
})
it('counts a provider return once when its GET receipt arrives before its POST response',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const id=randomUUID(),source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id,paymentId:f.packet.id,status:'SUCCESS',amount:{minor:'50000',currency:'PHP'},reason:null}],refundPayment:async(request:{paymentId:string;amount:{minor:string;currency:string}})=>{await reconcilePaymentRefunds(f.worker,f.payment.id,source);return {kind:'verified' as const,environment:'sandbox' as const,id,paymentId:request.paymentId,status:'SUCCESS' as const,amount:request.amount}}}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source))
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('satisfied')
 expect(await h.rows('refund-operations',{state:{equals:'completed'}})).toHaveLength(1)
})
it('releases only its own reservation after a known gateway refusal',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const source={...merchantGatewayFor(f.packet),refundPayment:async()=>({kind:'refused' as const,reason:'provider-authentication' as const})}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source))
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('failed')
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('200000')
})
it('keeps an abandoned dispatch reserved and escalates it after bounded merchant checks',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 let posts=0;const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[],refundPayment:async(request:{operationId:string;paymentId:string})=>{posts++;return {kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId}}}
 await dispatchRefund(worker,lease,source)
 h.clock.set(new Date(Date.parse(lease.expiresAt)+1).toISOString())
 expect(await claimWork(worker,'refund')).toBeNull();expect((await h.rows('work-items',{kind:{equals:'refund'}}))[0].state).toBe('uncertain')
 for(let check=0;check<3;check++){
  const next=(await claimWork(worker,'reconcile-refund'))!;expect(next).not.toBeNull();await beginWork(worker,next)
  await completeWork(worker,next,await reconcileRefundWork(worker,next,source))
  expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('uncertain')
  h.clock.set(new Date(Date.parse(h.clock.now())+31000).toISOString())
 }
 expect(await claimWork(worker,'reconcile-refund')).toBeNull();expect(posts).toBe(1)
 expect(await h.rows('payment-issues',{reasonCode:{equals:'refund-outcome-uncertain'}})).toHaveLength(1)
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
})
it('registers refund dispatch and reconciliation only with a configured merchant gateway',async()=>{
 const f=await setup(),saved={pub:process.env.MAYA_PUBLIC_KEY,secret:process.env.MAYA_SECRET_KEY},worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}}
 try{
  delete process.env.MAYA_PUBLIC_KEY;delete process.env.MAYA_SECRET_KEY;expect(workHandlersFor(worker).refund).toBeUndefined()
  process.env.MAYA_PUBLIC_KEY='pk-synthetic-refund-registration';process.env.MAYA_SECRET_KEY='sk-synthetic-refund-registration'
  const handlers=workHandlersFor(worker);expect(handlers.refund).toBeDefined();expect(handlers['reconcile-refund']).toBeDefined()
 }finally{if(saved.pub===undefined)delete process.env.MAYA_PUBLIC_KEY;else process.env.MAYA_PUBLIC_KEY=saved.pub;if(saved.secret===undefined)delete process.env.MAYA_SECRET_KEY;else process.env.MAYA_SECRET_KEY=saved.secret}
})
async function reviewer(f:Awaited<ReturnType<typeof setup>>){
 const staff=await h.seed('staff-users',{name:'Refund reviewer fixture',email:'refund-reviewer@example.test',password:'Synthetic-refund-reviewer-passphrase-946!',role:'developer'})
 return {...f.ctx,browserKey:opaqueSecret(),actor:{kind:'staff' as const,collection:'staff-users' as const,id:staff.id,role:staff.role}}
}
it('completes an offline reimbursement only after independent review of staff evidence',async()=>{
 const f=await setup(),review=await reviewer(f),operation=await authorizeRefund(f.ctx,{...f.input,method:'offline'})
 expect(await h.rows('work-items',{kind:{equals:'refund'}})).toHaveLength(0)
 const attested=await attestOfflineReimbursement(f.ctx,{refundId:operation.id,method:'bank-transfer',receiptReference:'BT-REFUND-0001',evidenceReference:'synthetic-signed-transfer-slip'})
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('authorized');expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 await expect(reviewOfflineReimbursement(f.ctx,{refundId:operation.id,evidenceId:attested.id,decision:'confirm'})).rejects.toThrow()
 await expect(reviewOfflineReimbursement(review,{refundId:operation.id,evidenceId:attested.id,decision:'confirm'})).resolves.toMatchObject({state:'completed',actualAmountMinor:'50000'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 await expect(attestOfflineReimbursement(f.ctx,{refundId:operation.id,method:'cash',receiptReference:'CASH-REFUND-0002',evidenceReference:'synthetic-second-slip'})).rejects.toThrow()
})
it('keeps an offline reservation when reviewed evidence is rejected and never reuses a receipt',async()=>{
 const f=await setup(),review=await reviewer(f),operation=await authorizeRefund(f.ctx,{...f.input,method:'offline'}),other=await authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID(),method:'offline'})
 const first=await attestOfflineReimbursement(f.ctx,{refundId:operation.id,method:'cash',receiptReference:'CASH-REFUND-0001',evidenceReference:'synthetic-unclear-slip'})
 await expect(reviewOfflineReimbursement(review,{refundId:operation.id,evidenceId:first.id,decision:'reject'})).resolves.toMatchObject({state:'authorized'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('100000')
 const second=await attestOfflineReimbursement(f.ctx,{refundId:operation.id,method:'cash',receiptReference:'CASH-REFUND-0002',evidenceReference:'synthetic-clear-slip'})
 await reviewOfflineReimbursement(review,{refundId:operation.id,evidenceId:second.id,decision:'confirm'})
 const reused=await attestOfflineReimbursement(f.ctx,{refundId:other.id,method:'cash',receiptReference:'CASH-REFUND-0002',evidenceReference:'synthetic-copied-slip'}).catch(()=>null)
 if(reused)await expect(reviewOfflineReimbursement(review,{refundId:other.id,evidenceId:reused.id,decision:'confirm'})).rejects.toThrow()
 expect((await h.rows('refund-operations',{id:{equals:other.id}}))[0].state).toBe('authorized');expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('100000')
})
async function uncertainWithImport(f:Awaited<ReturnType<typeof setup>>,minor='50000'){
 const operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const id=randomUUID(),source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id,paymentId:f.packet.id,status:'SUCCESS',amount:{minor,currency:'PHP'},reason:null}],refundPayment:async(request:{operationId:string;paymentId:string})=>({kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId})}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source));await reconcilePaymentRefunds(f.worker,f.payment.id,source)
 return {operation,imported:(await h.rows('refund-operations',{providerOperationId:{equals:id}}))[0]}
}
it('lets only an independent reviewer settle an uncertain request against one imported provider refund',async()=>{
 const f=await setup({manualResolution:'independent-provider-review'}),review=await reviewer(f),{operation,imported}=await uncertainWithImport(f)
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('100000')
 const input={refundId:operation.id,providerRefundId:imported.id,evidenceReference:'synthetic-dashboard-review'}
 await expect(resolveUncertainRefund(f.ctx,input)).rejects.toThrow()
 await expect(resolveUncertainRefund(review,input)).resolves.toMatchObject({state:'satisfied'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('150000')
 const second=await authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID()})
 await expect(resolveUncertainRefund(review,{...input,refundId:second.id})).rejects.toThrow()
})
it('refuses manual settlement when disabled or when the provider refund amount differs',async()=>{
 const disabled=await setup(),one=await uncertainWithImport(disabled),review=await reviewer(disabled)
 await expect(resolveUncertainRefund(review,{refundId:one.operation.id,providerRefundId:one.imported.id,evidenceReference:'synthetic-dashboard-review'})).rejects.toThrow()
 await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')
 const f=await setup({manualResolution:'independent-provider-review'}),other=await reviewer(f),two=await uncertainWithImport(f,'40000')
 await expect(resolveUncertainRefund(other,{refundId:two.operation.id,providerRefundId:two.imported.id,evidenceReference:'synthetic-dashboard-review'})).rejects.toThrow()
 expect((await h.rows('refund-operations',{id:{equals:two.operation.id}}))[0].state).toBe('uncertain')
})
it('enforces provider void timing, full-amount and refund window restrictions',async()=>{
 const f=await setup()
 await expect(authorizeRefund(f.ctx,{...f.input,method:'void'})).rejects.toThrow()
 await expect(authorizeRefund(f.ctx,{...f.input,method:'void',amount:{minor:'200000',currency:'PHP'}})).rejects.toThrow()
 h.clock.set('2026-11-16T05:00:00.000Z')
 await expect(authorizeRefund(f.ctx,f.input)).rejects.toThrow()
 await expect(authorizeRefund(f.ctx,{...f.input,method:'void',amount:{minor:'200000',currency:'PHP'}})).resolves.toMatchObject({method:'void',state:'authorized'})
 h.clock.set('2027-05-17T04:00:00.000Z')
 await expect(authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID()})).rejects.toThrow()
})
it('lets competing runners send one refund request at most once',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 let calls=0;const source={...merchantGatewayFor(f.packet),refundPayment:async(request:{operationId:string;paymentId:string})=>{calls++;return {kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId}}}
 await Promise.allSettled([dispatchRefund(worker,lease,source),dispatchRefund(worker,lease,source),dispatchRefund(worker,lease,source)])
 expect(calls).toBe(1);expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].dispatchGeneration).toBe(1)
})
it('lets a late stale failure release only its own reservation',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const id=randomUUID(),source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[],refundPayment:async(request:{paymentId:string;amount:{minor:string;currency:string}})=>({kind:'verified' as const,environment:'sandbox' as const,id,paymentId:request.paymentId,status:'FAILED' as const,amount:request.amount})}
 const late=await dispatchRefund(worker,lease,source)
 h.clock.set(new Date(Date.parse(lease.expiresAt)+1).toISOString())
 await expect(completeWork(worker,lease,late)).rejects.toThrow('Work lease is stale')
 const newer=await authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID(),amount:{minor:'150000',currency:'PHP'}})
 await reconcilePaymentRefunds(f.worker,f.payment.id,source)
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('failed')
 expect((await h.rows('refund-operations',{id:{equals:newer.id}}))[0].state).toBe('authorized')
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('50000')
})
it('counts a void once when the merchant root read arrives before its POST receipt',async()=>{
 const f=await setup();h.clock.set('2026-11-16T05:00:00.000Z')
 const operation=await authorizeRefund(f.ctx,{...f.input,method:'void',amount:{minor:'200000',currency:'PHP'}}),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const base=merchantGatewayFor(f.packet),id=randomUUID()
 const source={...base,retrieveRefunds:async()=>[],retrievePayment:async(paymentId:string)=>({...(await base.retrievePayment(paymentId)),status:'VOIDED'}),voidPayment:async(request:{paymentId:string;amount:{minor:string;currency:string}})=>{await reconcilePaymentRefunds(f.worker,f.payment.id,source);return {kind:'verified' as const,environment:'sandbox' as const,id,paymentId:request.paymentId,status:'SUCCESS' as const,amount:request.amount}}}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source))
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('satisfied')
 expect(await h.rows('refund-operations',{state:{equals:'completed'}})).toHaveLength(1)
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('0')
})
it('does not spend bounded merchant checks while the refund POST is still in flight',async()=>{
 const f=await setup({reconcileSeconds:5}),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve})
 const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[],refundPayment:async(request:{operationId:string;paymentId:string})=>{await hold;return {kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId}}}
 const pending=dispatchRefund(worker,lease,source)
 await vi.waitFor(async()=>expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('dispatching'))
 const start=Date.parse(h.clock.now())
 for(let step=1;step<=4;step++){
  h.clock.set(new Date(start+step*5000+1).toISOString())
  const check=await claimWork(worker,'reconcile-refund');if(!check)continue
  await beginWork(worker,check);await completeWork(worker,check,await reconcileRefundWork(worker,check,source))
 }
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].reconcileSequence).toBe(0)
 expect(await h.rows('payment-issues',{reasonCode:{equals:'refund-outcome-uncertain'}})).toHaveLength(0)
 release();await completeWork(worker,lease,await pending)
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('uncertain')
 expect((await h.rows('work-items',{and:[{kind:{equals:'reconcile-refund'}},{state:{equals:'ready'}}]})).length).toBeGreaterThan(0)
})
it('releases a reservation when dispatch fails before any provider request is possible',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 let calls=0;const source={...merchantGatewayFor(f.packet),refundPayment:async()=>{calls++;return {kind:'refused' as const,reason:'configuration' as const}}}
 const broken={...worker,policy:{...worker.policy,id:randomUUID()}}
 await completeWork(worker,lease,await dispatchRefund(broken,lease,source))
 expect(calls).toBe(0);expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0]).toMatchObject({state:'failed',dispatchGeneration:0})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('200000')
})
it('lets staff withdraw an unsent refund request or an offline reimbursement without recorded evidence',async()=>{
 const f=await setup(),review=await reviewer(f),unsent=await authorizeRefund(f.ctx,f.input),offline=await authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID(),method:'offline'})
 await expect(withdrawRefund(f.ctx,{refundId:unsent.id,reason:'entered-in-error'})).resolves.toMatchObject({state:'cancelled'})
 const worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}};expect(await claimWork(worker,'refund')).toBeNull()
 const attested=await attestOfflineReimbursement(f.ctx,{refundId:offline.id,method:'cash',receiptReference:'CASH-WITHDRAW-1',evidenceReference:'synthetic-slip'})
 await expect(withdrawRefund(f.ctx,{refundId:offline.id,reason:'entered-in-error'})).rejects.toThrow()
 await reviewOfflineReimbursement(review,{refundId:offline.id,evidenceId:attested.id,decision:'reject'})
 await expect(withdrawRefund(f.ctx,{refundId:offline.id,reason:'entered-in-error'})).resolves.toMatchObject({state:'cancelled'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('200000')
 await expect(withdrawRefund({...f.ctx,actor:{kind:'customer',collection:'customers',id:f.customer.id}},{refundId:offline.id,reason:'entered-in-error'})).rejects.toThrow()
})
it('refuses to withdraw a refund whose single provider request may already have been sent',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}},lease=(await claimWork(worker,'refund'))!;await beginWork(worker,lease)
 const source={...merchantGatewayFor(f.packet),refundPayment:async(request:{operationId:string;paymentId:string})=>({kind:'unknown' as const,environment:'sandbox' as const,paymentId:request.paymentId,operationId:request.operationId})}
 await completeWork(worker,lease,await dispatchRefund(worker,lease,source))
 await expect(withdrawRefund(f.ctx,{refundId:operation.id,reason:'entered-in-error'})).rejects.toThrow()
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('uncertain')
})
it('treats a restored unsent refund as uncertain and schedules a merchant check',async()=>{
 const f=await setup(),operation=await authorizeRefund(f.ctx,f.input)
 await h.uow.run({kind:'system',purpose:'recovery'},tx=>invalidateRestoredCapabilities(tx,h.clock.now()))
 expect((await h.rows('refund-operations',{id:{equals:operation.id}}))[0].state).toBe('uncertain')
 expect((await h.rows('work-items',{and:[{kind:{equals:'reconcile-refund'}},{state:{equals:'ready'}}]})).length).toBe(1)
 expect((await h.rows('work-items',{kind:{equals:'refund'}}))[0].state).toBe('uncertain')
})
it('refuses any repayment of a Maya collection until a merchant check imports dashboard refunds',async()=>{
 const f=await setup({},false),dashboard=randomUUID(),full={minor:'200000',currency:'PHP' as const}
 const source={...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[{id:dashboard,paymentId:f.packet.id,status:'SUCCESS',amount:{minor:'200000',currency:'PHP'},reason:'Dashboard refund'}]}
 await expect(authorizeRefund(f.ctx,{...f.input,method:'offline',amount:full})).rejects.toThrow()
 await expect(checkPaymentRefunds({...f.ctx,actor:{kind:'customer',collection:'customers',id:f.customer.id}},f.payment.id,source)).rejects.toThrow()
 await expect(checkPaymentRefunds(f.ctx,f.payment.id,source)).resolves.toMatchObject({state:'reconciled'})
 expect((await readRefundCapacity(f.ctx,f.payment.id)).minor).toBe('0')
 await expect(authorizeRefund(f.ctx,{...f.input,commandKey:randomUUID(),method:'offline',amount:full})).rejects.toThrow()
 expect(await h.rows('refund-operations',{origin:{equals:'app'}})).toHaveLength(0)
})
it('requires the merchant refund check to be recent',async()=>{
 const f=await setup()
 h.clock.set(new Date(Date.parse(h.clock.now())+16*60000).toISOString())
 await expect(authorizeRefund(f.ctx,f.input)).rejects.toThrow()
 await checkPaymentRefunds(f.ctx,f.payment.id,{...merchantGatewayFor(f.packet),retrieveRefunds:async()=>[]})
 await expect(authorizeRefund(f.ctx,f.input)).resolves.toMatchObject({state:'authorized'})
})
