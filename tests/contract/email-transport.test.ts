import {it,expect,vi} from 'vitest'
import {createServer} from 'node:net'
import {nodemailerAdapter} from '@payloadcms/email-nodemailer'
import type {Payload} from 'payload'
import {bookingConfirmation,authMessage} from '@/email/templates'
import {smtpMailer,configuredMailer} from '@/email/transport'
import {syntheticEmailPolicy} from '../support/email-policy'
import {syntheticPolicy} from '../support/policies'
const input={code:'ACN-FIXTURE',recipient:'guest@example.test',name:'Private guest',room:'Fixture room',arrival:'2027-05-10',departure:'2027-05-12',adults:2,children:0,total:{minor:'20000',currency:'PHP'},timezone:'Asia/Manila'},sender={address:'hello@example.test',name:'Acornelia'}
it.each([250,451,550])('uses the real installed SMTP adapter against loopback reply %i without contacting an external provider',async code=>{
 const envelopes:string[]=[],bodies:string[]=[];let body='',data=false
 const server=createServer(socket=>{
  socket.write('220 local-fixture ESMTP\r\n');let buffer=''
  socket.on('data',chunk=>{buffer+=chunk.toString();let end:number
   while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2)
    if(data){if(line==='.') {bodies.push(body);body='';data=false;socket.write(code+' fixture reply\r\n')}else body+=line+'\n';continue}
    if(/^EHLO|^HELO/.test(line))socket.write('250-local-fixture\r\n250 PIPELINING\r\n')
    else if(/^MAIL|^RCPT/.test(line)){envelopes.push(line);socket.write('250 accepted\r\n')}
    else if(line==='DATA'){data=true;socket.write('354 send content\r\n')}
    else if(line==='QUIT'){socket.end('221 bye\r\n')}else socket.write('250 okay\r\n')
   }
  })
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
  const address=server.address();if(!address||typeof address==='string')throw new Error('Loopback SMTP is unavailable')
  const adapter=(await nodemailerAdapter({defaultFromAddress:sender.address,defaultFromName:sender.name,skipVerify:true,transportOptions:{host:'127.0.0.1',port:address.port,secure:false,ignoreTLS:true,connectionTimeout:1000,greetingTimeout:1000,socketTimeout:1000}}))({payload:{} as Payload})
  const message=bookingConfirmation(input,sender),result=await smtpMailer(value=>adapter.sendEmail(value)).send(message)
  if(code===250)expect(result).toEqual({kind:'accepted',providerMessageId:'<'+message.id+'@acornelia.invalid>'});else expect(result).toEqual({kind:'refused',reason:code<500?'temporary':'permanent'})
  expect(envelopes).toContain('RCPT TO:<codeboxstudios.official@gmail.com>');expect(envelopes).toContain('RCPT TO:<guest@example.test>')
  expect(bodies).toHaveLength(1);expect(bodies[0]).toContain('ACN-FIXTURE');expect(bodies[0]).not.toContain('token=')
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
})
it.each([[451,'temporary'],[550,'permanent']])('classifies explicit SMTP %i rejection as definite nonacceptance',async(code,reason)=>{
 let calls=0;const mailer=smtpMailer(async()=>{calls++;throw Object.assign(new Error('Provider body must not escape'),{responseCode:code,command:'DATA'})})
 expect(await mailer.send(bookingConfirmation(input,sender))).toEqual({kind:'refused',reason});expect(calls).toBe(1)
})
it('retains timeout, malformed acceptance and partial recipient acceptance as uncertain without retrying',async()=>{
 for(const send of [async()=>{throw Object.assign(new Error('PRIVATE transport failure'),{code:'ETIMEDOUT'})},async()=>({accepted:['guest@example.test'],rejected:['codeboxstudios.official@gmail.com'],messageId:'partial'}),async()=>({nonsense:true})]){
  let calls=0;const result=await smtpMailer(async()=>{calls++;return send()}).send(bookingConfirmation(input,sender))
  expect(result.kind).toBe('unknown');expect(calls).toBe(1);expect(JSON.stringify(result)).not.toContain('PRIVATE')
 }
})
it('rejects copied authentication tokens and unapproved live transport before invoking SMTP',async()=>{
 let calls=0;const message=authMessage({purpose:'reset',recipient:input.recipient,name:input.name,token:'A'.repeat(43)},sender,'https://example.test')
 await expect(smtpMailer(async()=>{calls++}).send({...message,cc:['codeboxstudios.official@gmail.com']})).rejects.toThrow()
 expect(calls).toBe(0)
 const base=syntheticPolicy(),policy={...base,approvedSections:[...base.approvedSections,'transactionalEmail'],sections:{...base.sections,transactionalEmail:syntheticEmailPolicy()}}
 expect(configuredMailer(policy)).toBeNull()
})

it('treats a late SMTP failure after message acceptance as unknown, even if it carries a negative reply',async()=>{
 for(const command of ['QUIT',undefined]){
  const result=await smtpMailer(async()=>{throw Object.assign(new Error('late protocol failure'),{responseCode:451,command})}).send(bookingConfirmation(input,sender))
  expect(result.kind).toBe('unknown')
 }
})

it('registers approved matching SMTP configuration without opening a connection and rejects sender or port drift',()=>{
 const base=syntheticPolicy(),policy={...base,approvedSections:['work','transactionalEmail'],sections:{work:{leaseSeconds:30,maxAttempts:3,maxBatch:5,backoffSeconds:[5],runSeconds:10},transactionalEmail:syntheticEmailPolicy()}}
 const settings={EMAIL_TRANSPORT:'brevo-smtp',EMAIL_FROM:'hello@example.test',EMAIL_FROM_NAME:'Acornelia',BOOKING_CONFIRMATION_CC:'codeboxstudios.official@gmail.com',BREVO_SMTP_HOST:'smtp-relay.brevo.com',BREVO_SMTP_PORT:'587',BREVO_SMTP_USER:'synthetic-smtp-user',BREVO_SMTP_PASSWORD:'synthetic-smtp-password'}
 try{for(const [key,value] of Object.entries(settings))vi.stubEnv(key,value)
 expect(configuredMailer(policy)).not.toBeNull()
 vi.stubEnv('BREVO_SMTP_PORT','465');expect(configuredMailer(policy)).toBeNull()
 vi.stubEnv('BREVO_SMTP_PORT','587');vi.stubEnv('EMAIL_FROM','wrong@example.test');expect(configuredMailer(policy)).toBeNull()
 }finally{vi.unstubAllEnvs()}
})
