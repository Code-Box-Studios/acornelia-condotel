import {nodemailerAdapter} from '@payloadcms/email-nodemailer'
import {z} from 'zod'
import type {Payload} from 'payload'
import type {PolicySnapshot} from '@/domain/policy/types'
import {parseEnvironment} from '@/config/env'
import {workPolicySchema} from '@/domain/work/validation'
import {emailPolicy} from './policy'
import type {DeliveryResult,TransactionalMailer} from './types'
const address=z.email().max(254),safeLine=z.string().min(1).max(240).refine(value=>!/[\r\n\x00]/.test(value))
export const messageSchema=z.object({id:z.uuid(),kind:z.enum(['booking','booking-view','auth','claim','staff-reset','enquiry','payment-issue']),from:z.object({address,name:safeLine}).strict(),to:z.array(address).min(1).max(10),cc:z.array(address).max(10),subject:safeLine,html:z.string().min(1).max(30000),text:z.string().min(1).max(15000)}).strict()
/** No automatic SMTP resend. Negative SMTP replies prove nonacceptance; a lost reply does not. */
export function smtpMailer(send:(options:Record<string,unknown>)=>Promise<unknown>):TransactionalMailer{return {send:async(input,signal):Promise<DeliveryResult>=>{
  const value=messageSchema.parse(input)
  if(value.kind!=='booking'&&value.cc.length)throw new Error('Private messages cannot have confirmation copies')
  if(value.kind==='booking'&&(value.html.includes('#token=')||value.text.includes('#token=')))throw new Error('A copied confirmation cannot contain private tokens')
  if(signal?.aborted)return {kind:'refused',reason:'temporary'}
  const messageId='<'+value.id+'@acornelia.invalid>'
  try{
    const result=z.object({messageId:z.string(),accepted:z.array(z.string()),rejected:z.array(z.string())}).parse(await send({from:value.from,to:value.to,cc:value.cc,subject:value.subject,html:value.html,text:value.text,messageId,disableFileAccess:true,disableUrlAccess:true}))
    const expected=[...value.to,...value.cc].map(item=>item.toLowerCase()),accepted=result.accepted.map(item=>item.toLowerCase())
    if(result.messageId!==messageId||result.rejected.length||expected.some(item=>!accepted.includes(item)))return {kind:'unknown',reason:'partial'}
    return {kind:'accepted',providerMessageId:messageId}
  }catch(error){
    const failure=error as {responseCode?:unknown;command?:unknown},code=failure?.responseCode,command=failure?.command
    const beforeAcceptance=typeof command==='string'&&/^(CONN|EHLO|HELO|STARTTLS|AUTH(?: [A-Z0-9_-]+)?|MAIL FROM|RCPT TO|DATA)$/.test(command)
    if(beforeAcceptance&&typeof code==='number'&&code>=400&&code<600)return {kind:'refused',reason:code<500?'temporary':'permanent'}
    return {kind:'unknown',reason:(error as {code?:unknown})?.code==='ETIMEDOUT'?'timeout':'transport'}
  }
}}}
export function configuredMailer(snapshot:PolicySnapshot):TransactionalMailer|null{
  try{
    const env=parseEnvironment(process.env),settings=emailPolicy(snapshot),work=workPolicySchema.parse(snapshot.sections.work)
    if(env.operationMode!=='normal'||process.env.EMAIL_TRANSPORT!=='brevo-smtp'||process.env.EMAIL_FROM!==settings.sender.address||process.env.EMAIL_FROM_NAME!==settings.sender.name||process.env.BOOKING_CONFIRMATION_CC!==settings.confirmationCc||process.env.BREVO_SMTP_HOST!=='smtp-relay.brevo.com'||process.env.BREVO_SMTP_PORT!=='587'||!process.env.BREVO_SMTP_USER||!process.env.BREVO_SMTP_PASSWORD||settings.timeoutMs>=Math.min(work.leaseSeconds-1,work.runSeconds-1)*1000)return null
    let adapter:ReturnType<typeof nodemailerAdapter>|undefined
    return smtpMailer(async options=>{
      if(parseEnvironment(process.env).operationMode!=='normal')throw new Error('Email is quarantined')
      adapter??=nodemailerAdapter({defaultFromAddress:settings.sender.address,defaultFromName:settings.sender.name,skipVerify:true,transportOptions:{host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user:process.env.BREVO_SMTP_USER,pass:process.env.BREVO_SMTP_PASSWORD},connectionTimeout:settings.timeoutMs,greetingTimeout:settings.timeoutMs,socketTimeout:settings.timeoutMs,logger:false,debug:false,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true}}})
      return (await adapter)({payload:{} as Payload}).sendEmail(options)
    })
  }catch{return null}
}
