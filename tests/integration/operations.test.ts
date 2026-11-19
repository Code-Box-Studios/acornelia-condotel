import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {confirmedOperationsFixture} from '../support/operations-fixtures'
import {lookupBooking,readBooking,readCalendar,readToday,searchBookings} from '@/domain/operations/read'
import {addStaffNote,closeEnquiry,recordStayAction,resolvePaymentIssue} from '@/domain/operations/stay-actions'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
const stay=(f:Awaited<ReturnType<typeof confirmedOperationsFixture>>,action:'check-in'|'check-out'|'no-show',commandKey=randomUUID())=>recordStayAction(f.ctx,{commandKey,bookingId:f.booking.id,expectedRevision:f.booking.revision,action})
it('requires authorized staff for booking-code lookup and records the sensitive read',async()=>{
 const f=await confirmedOperationsFixture(h),code=f.booking.code!
 for(const actor of [{kind:'anonymous' as const},{kind:'customer' as const,collection:'customers' as const,id:f.customer.id}])await expect(lookupBooking({...f.ctx,actor},code)).rejects.toThrow()
 const view=await lookupBooking(f.ctx,code.toLowerCase())
 expect(view).toMatchObject({bookingCode:code,status:'confirmed',stayState:'expected',arrival:'2027-05-10',departure:'2027-05-12'})
 expect(view?.collected).toEqual([{minor:'20000',currency:'PHP'}]);expect(view?.contact?.email).toBe('dispatch-guest@example.test')
 expect(await lookupBooking(f.ctx,'ACN-0000000000000000')).toBeNull()
 expect(await h.rows('audit-entries',{action:{equals:'operations:booking-viewed'}})).toHaveLength(1)
})
it('refuses operations reads and actions when the approved role list excludes the staff role',async()=>{
 const f=await confirmedOperationsFixture(h,{operations:{roles:{view:['developer'],stay:['developer']}}})
 await expect(lookupBooking(f.ctx,f.booking.code!)).rejects.toThrow();await expect(readToday(f.ctx,'2027-05-10')).rejects.toThrow()
 h.clock.set('2027-05-10T06:00:00.000Z');await expect(stay(f,'check-in')).rejects.toThrow()
 expect(await h.rows('stay-events')).toHaveLength(0)
})
it('lists arrivals, departures and in-house stays for one property date with the range behind the totals',async()=>{
 const f=await confirmedOperationsFixture(h)
 const arrivalDay=await readToday(f.ctx,'2027-05-10')
 expect(arrivalDay.arrivals.map(row=>row.bookingCode)).toEqual([f.booking.code]);expect(arrivalDay.range).toEqual({from:'2027-05-10',to:'2027-05-16',timezone:'Asia/Manila'})
 expect((await readToday(f.ctx,'2027-05-04')).upcoming.map(row=>row.bookingCode)).toEqual([f.booking.code])
 h.clock.set('2027-05-10T06:00:00.000Z');await stay(f,'check-in')
 const middle=await readToday(f.ctx,'2027-05-11')
 expect(middle.inHouse.map(row=>row.bookingCode)).toEqual([f.booking.code]);expect(middle.arrivals).toHaveLength(0)
 expect((await readToday(f.ctx,'2027-05-12')).departures.map(row=>row.stayState)).toEqual(['in-house'])
})
it('checks a guest in once and out afterwards, refusing early, repeated and out-of-order actions',async()=>{
 const f=await confirmedOperationsFixture(h)
 await expect(stay(f,'check-out')).rejects.toThrow()
 await expect(stay(f,'check-in')).rejects.toThrow()
 h.clock.set('2027-05-10T06:00:00.000Z')
 const key=randomUUID(),results=await Promise.allSettled([stay(f,'check-in',key),stay(f,'check-in')])
 expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1)
 expect((await stay(f,'check-in',key)).kind).toBe('checked-in')
 expect(await h.rows('stay-events',{kind:{equals:'checked-in'}})).toHaveLength(1)
 h.clock.set('2027-05-12T02:00:00.000Z');await expect(stay(f,'check-out')).resolves.toMatchObject({kind:'checked-out'})
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].status).toBe('completed')
 await expect(stay(f,'check-out')).rejects.toThrow();expect((await readBooking(f.ctx,f.booking.id)).stayState).toBe('departed')
})
it('records a no-show only after the approved property hour and still admits a late arrival',async()=>{
 const f=await confirmedOperationsFixture(h)
 h.clock.set('2027-05-10T06:00:00.000Z');await expect(stay(f,'no-show')).rejects.toThrow()
 h.clock.set('2027-05-10T12:30:00.000Z');await expect(stay(f,'no-show')).resolves.toMatchObject({kind:'no-show'})
 expect((await readBooking(f.ctx,f.booking.id)).stayState).toBe('no-show')
 h.clock.set('2027-05-10T15:30:00.000Z');await stay(f,'check-in');expect((await readBooking(f.ctx,f.booking.id)).stayState).toBe('in-house')
})
it('rejects a stay action against a stale booking revision',async()=>{
 const f=await confirmedOperationsFixture(h);h.clock.set('2027-05-10T06:00:00.000Z')
 await expect(recordStayAction(f.ctx,{commandKey:randomUUID(),bookingId:f.booking.id,expectedRevision:f.booking.revision+1,action:'check-in'})).rejects.toThrow()
})
it('keeps staff notes internal, bounded and out of the action log text',async()=>{
 const f=await confirmedOperationsFixture(h),text='Guest asked for a late check-in after 22:00.'
 await addStaffNote(f.ctx,{commandKey:randomUUID(),bookingId:f.booking.id,text})
 const view=await readBooking(f.ctx,f.booking.id);expect(view.notes.map(row=>row.text)).toEqual([text]);expect(view.notes[0].staffName).toBe('Front desk fixture')
 await expect(addStaffNote(f.ctx,{commandKey:randomUUID(),bookingId:f.booking.id,text:'x'.repeat(2001)})).rejects.toThrow()
 const audit=await h.rows('audit-entries',{action:{equals:'operations:note-added'}});expect(audit).toHaveLength(1);expect(JSON.stringify(audit[0])).not.toContain('late check-in')
})
it('resolves an open payment issue once with a controlled reason and evidence reference',async()=>{
 const f=await confirmedOperationsFixture(h),issue=await h.seed('payment-issues',{issueKey:'synthetic-extra-collection',reasonCode:'extra-collection',booking:f.booking.id,state:'open'})
 await expect(resolvePaymentIssue(f.ctx,{issueId:issue.id,resolutionCode:'money-returned',evidenceReference:'synthetic-refund-review'})).resolves.toMatchObject({state:'resolved',resolutionCode:'money-returned'})
 await expect(resolvePaymentIssue(f.ctx,{issueId:issue.id,resolutionCode:'no-action-required',evidenceReference:'synthetic-second-review'})).rejects.toThrow()
 const restricted=await h.seed('payment-issues',{issueKey:'synthetic-second-issue',reasonCode:'payment-uncertain',booking:f.booking.id,state:'open'})
 await expect(resolvePaymentIssue({...f.ctx,actor:{kind:'customer',collection:'customers',id:f.customer.id}},{issueId:restricted.id,resolutionCode:'money-returned',evidenceReference:'synthetic'})).rejects.toThrow()
})
it('closes an enquiry follow-up with its outcome and an internal note',async()=>{
 const f=await confirmedOperationsFixture(h),enquiry=await h.seed('enquiries',{reference:'ENQ-SYNTHETIC-1',nonce:randomUUID(),fingerprint:randomUUID(),emailHash:'synthetic-hash',submittedAt:h.clock.now(),contact:{name:'Event planner',email:'planner@example.test'},state:'delivered'})
 await expect(closeEnquiry(f.ctx,{enquiryId:enquiry.id,outcome:'contacted',note:'Called back about a June reception.'})).resolves.toMatchObject({state:'closed'})
 expect(await h.rows('staff-notes',{enquiry:{equals:enquiry.id}})).toHaveLength(1)
 await expect(closeEnquiry(f.ctx,{enquiryId:enquiry.id,outcome:'contacted',note:'Again'})).rejects.toThrow()
})
it('finds bookings by guest text, code or arrival range and shows stays and blocks on the room calendar',async()=>{
 const f=await confirmedOperationsFixture(h,{contactName:'Maria Santos'})
 expect((await searchBookings(f.ctx,{text:'santos'})).map(row=>row.bookingCode)).toEqual([f.booking.code])
 expect((await searchBookings(f.ctx,{text:f.booking.code!.toLowerCase()})).map(row=>row.bookingCode)).toEqual([f.booking.code])
 expect(await searchBookings(f.ctx,{from:'2027-06-01',to:'2027-06-30'})).toHaveLength(0)
 const room=(await h.rows('rooms'))[0],block=await h.seed('allocations',{room:room.id,purpose:'block',arrival:'2027-05-13T00:00:00.000Z',departure:'2027-05-14T00:00:00.000Z',released:false})
 await h.seed('room-blocks',{room:room.id,allocation:block.id,arrival:block.arrival,departure:block.departure,reason:'Aircon service',state:'active'})
 const calendar=await readCalendar(f.ctx,{from:'2027-05-09',days:7})
 expect(calendar.days[0]).toBe('2027-05-09');expect(calendar.rooms.map(row=>row.label)).toContain(room.label)
 expect(calendar.entries.map(row=>[row.kind,row.from,row.to,row.label])).toEqual(expect.arrayContaining([['booking','2027-05-10','2027-05-12',null],['block','2027-05-13','2027-05-14','Aircon service']]))
})
it('keeps generated reads of operations, refund and recovery records to developers and logs them',async()=>{
 const f=await confirmedOperationsFixture(h);await addStaffNote(f.ctx,{commandKey:randomUUID(),bookingId:f.booking.id,text:'Generated-read probe note'})
 const staffUser={...await h.payload.findByID({collection:'staff-users',id:f.staff.id,overrideAccess:true}),collection:'staff-users' as const}
 for(const collection of ['staff-notes','stay-events','refund-operations','refund-evidence','payment-issues','recovery-fences'] as const)await expect(h.payload.find({collection,user:staffUser,overrideAccess:false})).rejects.toThrow()
 const developer=await h.seed('staff-users',{name:'Generated read developer',email:'generated-read@example.test',password:'Synthetic-generated-read-passphrase-946!',role:'developer'})
 const developerUser={...await h.payload.findByID({collection:'staff-users',id:developer.id,overrideAccess:true}),collection:'staff-users' as const}
 expect((await h.payload.find({collection:'staff-notes',user:developerUser,overrideAccess:false})).docs).toHaveLength(1)
 expect(await h.rows('audit-entries',{action:{equals:'staff-notes:read'}})).toHaveLength(1)
})
