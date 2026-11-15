import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {config,payment,headers,bytes,now} from '../support/maya-delivery'
import {receiveMayaWebhook} from '@/integrations/maya/webhook'
import {verifyMayaDelivery} from '@/integrations/maya/signature'
import {ingestMayaDelivery} from '@/domain/payments/inbox'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()})
beforeEach(async()=>{await h.reset();h.clock.set(now)})
afterAll(async()=>{await h?.reset();await h?.close()})
const request=(body:unknown=payment,time=Date.parse(now))=>new Request('http://127.0.0.1/api/webhooks/maya',{method:'POST',headers:new Headers([...headers(0,time),['content-type','application/json']]),body:JSON.stringify(body)})
const context=()=>h.ctx({kind:'system',purpose:'payments'})
it('rejects tampering while deduplicating a freshly signed retry',async()=>{
  expect((await receiveMayaWebhook(request({...payment,amount:1}),config,context())).status).toBe(401)
  expect((await receiveMayaWebhook(request(),config,context())).status).toBe(200)
  expect((await receiveMayaWebhook(request(payment,Date.parse(now)+1000),config,context())).status).toBe(200)
  const rows=await h.rows('payment-inbox')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({providerPaymentId:payment.id,merchantReference:'ACN_WEBHOOK',amountMinor:'12345',state:'pending'})
  expect(JSON.stringify(rows)).not.toMatch(/masked|5555|signature|nonce|BEGIN/)
  expect(await h.rows('work-items')).toHaveLength(1)
  expect(await h.rows('payment-transactions')).toHaveLength(0)
})
it('recovers committed evidence after losing acknowledgement and restarting the database client',async()=>{
  // The caller discards the acknowledgement after the atomic inbox/work commit.
  await receiveMayaWebhook(request(),config,context())
  await h.close();h=await createHarness();h.clock.set(now)
  expect((await receiveMayaWebhook(request(payment,Date.parse(now)+2000),config,context())).status).toBe(200)
  expect(await h.rows('payment-inbox')).toHaveLength(1)
  expect(await h.rows('work-items')).toHaveLength(1)
})
it('keeps evidence, work and required audit atomic under a storage failure',async()=>{
  await h.pool.query("CREATE FUNCTION inbox_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected inbox audit failure'; END $$; CREATE TRIGGER inbox_test_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION inbox_test_failure()")
  try{
    expect((await receiveMayaWebhook(request(),config,context())).status).toBe(503)
    expect(await h.rows('payment-inbox')).toHaveLength(0);expect(await h.rows('work-items')).toHaveLength(0)
  }finally{await h.pool.query('DROP TRIGGER inbox_test_failure ON audit_entries; DROP FUNCTION inbox_test_failure()')}
})
it('deduplicates competing deliveries and rejects public fabricated authority or changed evidence',async()=>{
  const delivery=verifyMayaDelivery(bytes(payment),headers(),config,now)
  await expect(ingestMayaDelivery({...context(),actor:{kind:'anonymous'}},delivery)).rejects.toThrow()
  await expect(ingestMayaDelivery(context(),{...delivery})).rejects.toThrow()
  await Promise.all([ingestMayaDelivery(context(),delivery),ingestMayaDelivery(context(),delivery)])
  const row=(await h.rows('payment-inbox'))[0]
  expect(await h.rows('payment-inbox')).toHaveLength(1);expect(await h.rows('work-items')).toHaveLength(1)
  await expect(h.pool.query('UPDATE payment_inbox SET amount_minor=$1 WHERE id=$2',['1',row.id])).rejects.toThrow()
  await expect(h.pool.query('DELETE FROM payment_inbox WHERE id=$1',[row.id])).rejects.toThrow()
})
