import {expect,it} from 'vitest'
import {bookingConfirmation,authMessage,claimMessage,privateBookingMessage} from '@/email/templates'
const sender={address:'hello@example.test',name:'Acornelia'}
const booking={code:'ACN-EXAMPLE',recipient:'guest@example.test',name:'<img src=x onerror=alert(1)>',room:'Garden <suite>',arrival:'2027-05-10',departure:'2027-05-12',adults:2,children:0,total:{minor:'20000',currency:'PHP'},timezone:'Asia/Manila'}
it('copies booking confirmation without copying reset or claim tokens',()=>{
 const confirmation=bookingConfirmation(booking,sender),resetMessage=authMessage({purpose:'reset',recipient:booking.recipient,name:booking.name,token:'A'.repeat(43)},sender,'https://example.test'),claim=claimMessage({recipient:booking.recipient,approvalId:'11111111-1111-4111-8111-111111111111',token:'B'.repeat(43)},sender,'https://example.test')
 expect(confirmation.cc).toEqual(['codeboxstudios.official@gmail.com'])
 expect(resetMessage.cc??[]).toHaveLength(0);expect(claim.cc??[]).toHaveLength(0)
 expect(confirmation.html).not.toContain('token=');expect(confirmation.html).not.toContain('<img')
 expect(resetMessage.html).toContain('/account/reset#token=');expect(claim.html).toContain('#')
})
it('sends private booking-view capability only to the frozen contact without copying it',()=>{
 const message=privateBookingMessage(booking,sender,'https://example.test/booking/view#token=PRIVATE')
 expect(message.to).toEqual([booking.recipient]);expect(message.cc).toEqual([])
 expect(message.html).toContain('#token=PRIVATE');expect(message.html).toContain('ACN-EXAMPLE')
 expect(message.html).toContain('&lt;img');expect(message.text).toContain('200.00 PHP')
})
