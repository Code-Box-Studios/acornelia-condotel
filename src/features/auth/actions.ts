import {enqueue} from '@/domain/work/enqueue'
import {createHmac,pbkdf2} from 'node:crypto'
import {promisify} from 'node:util'
import {z} from 'zod'
import type {Payload} from 'payload'
import type {Customer} from '@/payload-types'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {appendAudit} from '@/domain/audit/append'
import {encryptPrivateState,matchesPrivateDigest,opaqueSecret,privateDigest} from '@/domain/security/private-state'
export const AUTH_ACK={state:'accepted' as const,message:'If this address is eligible, we will send email instructions.'}
export const normalizedEmail=z.string().trim().email().max(254).transform(value=>value.toLowerCase())
export const customerPassword=z.string().min(12).max(128)
const registration=z.object({name:z.string().trim().min(1).max(120),email:normalizedEmail}).strict()
const activation=z.object({name:z.string().trim().min(1).max(120),password:customerPassword}).strict()
export function assertCustomerAuthAvailable(ctx:CommandContext,recovery=false){
  if(process.env.APP_ENV==='production'&&(process.env.CUSTOMER_AUTH_METHOD!=='email-password'||!ctx.policy.approvedSections.includes('customer-auth')||recovery&&!ctx.policy.approvedSections.includes('customer-recovery')))throw new Error('Customer access is temporarily unavailable')
}
function emailDigest(email:string){return createHmac('sha256',process.env.PAYLOAD_SECRET!).update('auth-email\0'+email).digest('hex')}
export async function dummyPasswordWork(payload:Payload,password='private-auth-timing-work'):Promise<void>{await promisify(pbkdf2)(password,'acornelia-private-auth-work',payload.config.auth.passwordHashIterations,32,'sha256')}
async function authCommand<T>(ctx:CommandContext,work:(tx:DbTx)=>Promise<T>):Promise<T>{
  for(let retry=0;;retry++){
    try{return await ctx.uow.run(ctx.actor,work)}catch(error){
      // Two first requests may race to create the unique technical counter/email row.
      const validation=error as {name?:string;data?:{errors?:{path?:string}[]}}
      if(retry<3&&validation.name==='ValidationError'&&validation.data?.errors?.some(issue=>['key','email'].includes(issue.path||'')))continue
      throw error
    }
  }
}
async function takeSlot(tx:DbTx,ctx:CommandContext,email:string,purpose:string,limit=3):Promise<boolean>{
  const window=Math.floor(Date.parse(ctx.clock.now())/3600000),key=emailDigest(`${purpose}\0${window}\0${email}`)
  const existing=(await tx.payload.find({collection:'auth-throttles',where:{key:{equals:key}},req:tx.req,overrideAccess:false,limit:1})).docs[0]
  if(existing){if(existing.count>=limit)return false;await tx.payload.update({collection:'auth-throttles',id:existing.id,data:{count:existing.count+1},req:tx.req,overrideAccess:false})}
  else await tx.payload.create({collection:'auth-throttles',data:{key,count:1,expiresAt:new Date((window+1)*3600000).toISOString()},req:tx.req,overrideAccess:false})
  return true
}
async function customerByEmail(tx:DbTx,email:string){return (await tx.payload.find({collection:'customers',where:{email:{equals:email}},limit:1,depth:0,req:tx.req,overrideAccess:true})).docs[0]}
async function issue(tx:DbTx,ctx:CommandContext,customer:Customer,purpose:'verify'|'reset'){
  const token=opaqueSecret(),expiresAt=new Date(Date.parse(ctx.clock.now())+(purpose==='verify'?60:20)*60000).toISOString()
  const grant=await tx.payload.create({collection:'auth-tokens',data:{tokenHash:privateDigest(token),purpose,account:customer.id,emailHash:emailDigest(customer.email),securityRevision:customer.securityRevision,expiresAt},req:tx.req,overrideAccess:false})
  const delivery=await tx.payload.create({collection:'auth-deliveries',data:{purpose,account:customer.id,tokenRef:grant.id,expiresAt,state:'pending',encryptedState:'pending'},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'auth-deliveries',id:delivery.id,data:{encryptedState:encryptPrivateState({token,recipient:customer.email,name:customer.name,purpose},'auth-delivery:'+delivery.id)},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:`auth:${grant.id}`,kind:'email',payload:{messageId:delivery.id,category:'auth'},availableAt:ctx.clock.now()})
}
export async function registerCustomer(ctx:CommandContext,input:{name:string;email:string}):Promise<typeof AUTH_ACK>{
  assertCustomerAuthAvailable(ctx);const parsed=registration.parse(input)
  return authCommand(ctx,async tx=>{
    if(!await takeSlot(tx,ctx,parsed.email,'register')){await dummyPasswordWork(tx.payload);return AUTH_ACK}
    let customer=await customerByEmail(tx,parsed.email)
    if(!customer){
      // Email-first activation replaces this unknown placeholder password with the recipient's choice.
      customer=await tx.payload.create({collection:'customers',data:{name:parsed.name,email:parsed.email,password:opaqueSecret(),_verified:false,securityRevision:1},disableVerificationEmail:true,req:tx.req,overrideAccess:true})
      await tx.payload.update({collection:'customers',id:customer.id,data:{_verificationToken:null},req:tx.req,overrideAccess:true})
      await appendAudit(tx,{action:'customer:registered',recordType:'customers',recordId:customer.id,outcome:'success'})
    }else await dummyPasswordWork(tx.payload)
    if(!customer.deactivated&&!customer._verified)await issue(tx,ctx,customer,'verify')
    return AUTH_ACK
  })
}
export async function requestCustomerRecovery(ctx:CommandContext,email:string):Promise<typeof AUTH_ACK>{
  assertCustomerAuthAvailable(ctx,true);const normalized=normalizedEmail.parse(email)
  return authCommand(ctx,async tx=>{
    await dummyPasswordWork(tx.payload)
    if(!await takeSlot(tx,ctx,normalized,'recover'))return AUTH_ACK
    const customer=await customerByEmail(tx,normalized)
    if(customer&&!customer.deactivated&&customer._verified)await issue(tx,ctx,customer,'reset')
    return AUTH_ACK
  })
}
async function consume(tx:DbTx,ctx:CommandContext,token:string,purpose:'verify'|'reset'){
  z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(token)
  const grant=(await tx.payload.find({collection:'auth-tokens',where:{and:[{tokenHash:{equals:privateDigest(token)}},{purpose:{equals:purpose}},{usedAt:{exists:false}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!grant||Date.parse(grant.expiresAt)<=Date.parse(ctx.clock.now())||!matchesPrivateDigest(token,grant.tokenHash))throw new Error('This link is invalid or has expired')
  const accountId=typeof grant.account==='string'?grant.account:grant.account.id
  const customer=await tx.payload.findByID({collection:'customers',id:accountId,depth:0,req:tx.req,overrideAccess:true})
  if(customer.deactivated||customer.securityRevision!==grant.securityRevision||emailDigest(customer.email)!==grant.emailHash||purpose==='verify'&&customer._verified||purpose==='reset'&&!customer._verified)throw new Error('This link is invalid or has expired')
  await tx.payload.update({collection:'auth-tokens',id:grant.id,data:{usedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
  return customer
}
export async function activateCustomer(ctx:CommandContext,token:string,input:{name:string;password:string}):Promise<void>{
  assertCustomerAuthAvailable(ctx);const parsed=activation.parse(input)
  await authCommand(ctx,async tx=>{
    const customer=await consume(tx,ctx,token,'verify')
    await tx.payload.update({collection:'customers',id:customer.id,data:{name:parsed.name,password:parsed.password,_verified:true,securityRevision:customer.securityRevision+1,sessions:[],resetPasswordToken:null,resetPasswordExpiration:null},req:tx.req,overrideAccess:true})
    await appendAudit(tx,{action:'customer:email-verified',recordType:'customers',recordId:customer.id,outcome:'success'})
  })
}
export async function resetCustomerPassword(ctx:CommandContext,token:string,password:string):Promise<void>{
  assertCustomerAuthAvailable(ctx,true);const parsed=customerPassword.parse(password)
  await authCommand(ctx,async tx=>{
    const customer=await consume(tx,ctx,token,'reset')
    await tx.payload.update({collection:'customers',id:customer.id,data:{password:parsed,securityRevision:customer.securityRevision+1,sessions:[],resetPasswordToken:null,resetPasswordExpiration:null},req:tx.req,overrideAccess:true})
    await appendAudit(tx,{action:'customer:password-reset',recordType:'customers',recordId:customer.id,outcome:'success'})
  })
}
