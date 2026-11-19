import {randomUUID} from 'node:crypto'
import {expect} from 'vitest'
import type {TestHarness} from './harness'
import {checkoutFixture} from './checkout-fixtures'
import {signedObservation} from './payment-observation'
import {applyPaymentObservation} from '@/domain/payments/observe'
import {opaqueSecret} from '@/domain/security/private-state'
import type {CommandContext} from '@/domain/db/types'
import type {OperationsOverrides} from './operations-policy'
/** A website booking confirmed by verified synthetic money, plus a signed-in staff context. */
export async function confirmedOperationsFixture(h:TestHarness,options:{operations?:OperationsOverrides;role?:'staff'|'developer';contactName?:string;refunds?:boolean;customer?:boolean;lifecycle?:Record<string,unknown>;changes?:boolean}={}){
 const f=await checkoutFixture(h,{operations:options.operations??{},contactName:options.contactName,customer:options.customer,lifecycle:options.lifecycle,...(options.changes?{changes:{}}:{}),...(options.refunds?{refunds:{}}:{})}),payments={...f.worker,actor:{kind:'system' as const,purpose:'payments' as const}},attempt=(await h.rows('payment-attempts'))[0]
 const packet={id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP',paymentAt:h.clock.now(),fundSource:{type:'card'},canRefund:true,canVoid:true}
 expect((await applyPaymentObservation(payments,await signedObservation(payments,packet))).state).toBe('confirmed')
 const booking=(await h.rows('bookings',{id:{equals:f.receipt.bookingId}}))[0],role=options.role??'staff'
 const staff=await h.seed('staff-users',{name:'Front desk fixture',email:'front-desk-'+role+'@example.test',password:'Synthetic-front-desk-passphrase-946!',role})
 const ctx:CommandContext={...f.ctx,browserKey:opaqueSecret(),actor:{kind:'staff',collection:'staff-users',id:staff.id,role:staff.role}}
 return {...f,booking,staff,ctx,packet,payments}
}
