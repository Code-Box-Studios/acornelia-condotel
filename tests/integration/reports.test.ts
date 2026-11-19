import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {confirmedOperationsFixture} from '../support/operations-fixtures'
import {privateDigest} from '@/domain/security/private-state'
import {csvCell,exportReportCsv,runReport} from '@/domain/operations/reports'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
async function completedRefund(f:Awaited<ReturnType<typeof confirmedOperationsFixture>>,minor:string){
 const payment=(await h.rows('payment-transactions'))[0],id=randomUUID()
 return h.seed('refund-operations',{commandKey:'provider:sandbox:'+id,fingerprint:privateDigest(id),origin:'provider',booking:f.booking.id,payment:payment.id,expectedRevision:f.booking.revision,method:'refund',state:'completed',amountMinor:minor,currency:'PHP',reason:'manual-review',providerEnvironment:'sandbox',providerOperationId:id,providerStatus:'SUCCESS',actualAmountMinor:minor,actualCurrency:'PHP',resultProof:{version:1,source:'merchant-get'},observedAt:h.clock.now(),completedAt:h.clock.now(),dispatchGeneration:0,reconcileSequence:0})
}
it('aggregates bookings, collections and refunds separately on property-local dates and per currency',async()=>{
 h.clock.set('2026-11-16T16:30:00.000Z')
 const f=await confirmedOperationsFixture(h,{role:'developer'});await completedRefund(f,'5000')
 const utcDay=await runReport(f.ctx,{from:'2026-11-16',to:'2026-11-16'})
 expect(utcDay.payments).toEqual([]);expect(utcDay.range).toEqual({from:'2026-11-16',to:'2026-11-16',timezone:'Asia/Manila'})
 const localDay=await runReport(f.ctx,{from:'2026-11-17',to:'2026-11-17'})
 expect(localDay.payments).toEqual([{currency:'PHP',collectedMinor:'20000',count:1}])
 expect(localDay.refunds).toEqual([{currency:'PHP',state:'completed',amountMinor:'5000',count:1}])
 expect(localDay.bookings).toEqual([])
 const stays=await runReport(f.ctx,{from:'2027-05-01',to:'2027-05-31'})
 expect(stays.bookings).toEqual([{status:'confirmed',count:1}]);expect(stays.payments).toEqual([])
 expect(stays.rows).toEqual([expect.objectContaining({bookingCode:f.booking.code,status:'confirmed',stayState:'expected',arrival:'2027-05-10',currency:'PHP',totalMinor:'20000',collectedMinor:'20000',refundedMinor:'5000'})])
 expect(await h.rows('audit-entries',{action:{equals:'operations:report-read'}})).toHaveLength(3)
})
it('neutralises spreadsheet formulas in exported cells and records each export',async()=>{
 const f=await confirmedOperationsFixture(h,{role:'developer',contactName:'=HYPERLINK("https://example.test","open")'})
 for(const value of ['=1+1','+639171234567','-5','@SUM(A1)','\tcmd','\rcmd'])expect(csvCell(value).replace(/^"/,'').startsWith("'")).toBe(true)
 expect(csvCell('Plain, "quoted" text')).toBe('"Plain, ""quoted"" text"')
 const csv=await exportReportCsv(f.ctx,{from:'2027-05-01',to:'2027-05-31'})
 expect(csv.split('\r\n')[0]).toBe('Booking code,Source,Booking status,Stay state,Arrival,Departure,Guest,Currency,Total,Collected,Refunded')
 expect(csv).toContain('"\'=HYPERLINK(""https://example.test"",""open"")"');expect(csv).toContain('200.00')
 expect(await h.rows('audit-entries',{action:{equals:'operations:report-exported'}})).toHaveLength(1)
})
it('requires approved report and export roles',async()=>{
 const f=await confirmedOperationsFixture(h,{role:'staff',operations:{roles:{reports:['developer']}}})
 await expect(runReport(f.ctx,{from:'2027-05-01',to:'2027-05-31'})).rejects.toThrow()
 await expect(exportReportCsv(f.ctx,{from:'2027-05-01',to:'2027-05-31'})).rejects.toThrow()
 await expect(runReport({...f.ctx,actor:{kind:'anonymous'}},{from:'2027-05-01',to:'2027-05-31'})).rejects.toThrow()
})
it('refuses reversed, malformed and overlong report ranges',async()=>{
 const f=await confirmedOperationsFixture(h,{role:'developer'})
 for(const query of [{from:'2027-05-31',to:'2027-05-01'},{from:'2027-02-30',to:'2027-03-01'},{from:'2027-01-01',to:'2027-12-31'}])await expect(runReport(f.ctx,query)).rejects.toThrow()
})
