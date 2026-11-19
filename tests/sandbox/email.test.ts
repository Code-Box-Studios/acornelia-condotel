import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {nodemailerAdapter} from '@payloadcms/email-nodemailer'
import type {Payload} from 'payload'
import {sandboxTarget} from '../support/sandbox'
import {smtpMailer} from '@/email/transport'
// Sends one real message through Brevo SMTP to an authorized test inbox. Nothing here runs without SANDBOX_AUTHORIZED=yes.
const sandbox=sandboxTarget(['EMAIL_FROM','EMAIL_FROM_NAME','BREVO_SMTP_USER','BREVO_SMTP_PASSWORD','SANDBOX_EMAIL_RECIPIENT'])
describe.skipIf(!sandbox.enabled)('Brevo sandbox delivery',()=>{
 it('accepts a synthetic message for the authorized test inbox through the application mailer',async()=>{
  if(!sandbox.enabled)return
  const {EMAIL_FROM:from,EMAIL_FROM_NAME:name,BREVO_SMTP_USER:user,BREVO_SMTP_PASSWORD:pass,SANDBOX_EMAIL_RECIPIENT:recipient}=sandbox.values
  const adapter=nodemailerAdapter({defaultFromAddress:from,defaultFromName:name,skipVerify:true,transportOptions:{host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user,pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000}})
  const mailer=smtpMailer(async options=>(await adapter)({payload:{} as Payload}).sendEmail(options))
  const id=randomUUID()
  expect(await mailer.send({id,kind:'enquiry',from:{address:from,name},to:[recipient],cc:[],subject:'Acornelia sandbox delivery check '+id.slice(0,8),html:'<p>Synthetic delivery check. No action is needed.</p>',text:'Synthetic delivery check. No action is needed.'})).toEqual({kind:'accepted',providerMessageId:'<'+id+'@acornelia.invalid>'})
 })
 it.todo('confirms inbox receipt, SPF/DKIM alignment and the booking-confirmation copy in the authorized inboxes')
})
