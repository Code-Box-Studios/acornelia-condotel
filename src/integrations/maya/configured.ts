import type {PolicySnapshot} from '@/domain/policy/types'
import type {MayaGateway} from './types'
import {z} from 'zod'
import {parseEnvironment} from '@/config/env'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {workPolicySchema} from '@/domain/work/validation'
import {recoveryPolicy} from '@/domain/payments/recovery-policy'
import {checkoutPolicySchema} from '@/domain/bookings/validation'
import {createMayaGateway} from './http'
const schema=z.object({environment:z.enum(['sandbox','production']),approvalReference:z.string().trim().min(1).max(240),checkoutEnabled:z.boolean(),kountEnabled:z.boolean(),voidEnabled:z.boolean(),refundEnabled:z.boolean(),partialRefunds:z.boolean(),moneyMethods:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(30),maxAmountMinor:z.string().regex(/^[1-9]\d*$/).max(30),timeoutMs:z.number().int().min(10).max(60000),checkoutMethods:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(30),methodConfigurationReference:z.string().trim().min(1).max(240).optional()}).strict()
export function configuredMayaGateway(input:PolicySnapshot,options:{requireCheckout?:boolean}={}):MayaGateway|null{
  try{
    const environment=parseEnvironment(process.env)
    if(environment.operationMode!=='normal')return null
    const policy=parseRuntimePolicy(input,['work','maya']),work=workPolicySchema.parse(policy.sections.work),settings=schema.parse(policy.sections.maya)
    if(settings.environment!==environment.mayaEnvironment||settings.timeoutMs>Math.min(work.runSeconds-1,work.leaseSeconds-1)*1000)return null
    if(options.requireCheckout!==false){
      const recovery=recoveryPolicy(policy),checkout=checkoutPolicySchema.parse(parseRuntimePolicy(input,['checkout']).sections.checkout)
      if(!settings.checkoutEnabled||settings.kountEnabled||!settings.checkoutMethods.length||!settings.methodConfigurationReference||checkout.holdMinutes*60000<=recovery.providerWindowMinutes*60000+settings.timeoutMs)return null
    }
    return createMayaGateway({environment:environment.mayaEnvironment,appEnv:environment.appEnv,appUrl:environment.appUrl,publicKey:process.env.MAYA_PUBLIC_KEY||'',secretKey:process.env.MAYA_SECRET_KEY||'',timeoutMs:settings.timeoutMs,capabilities:{environment:settings.environment,approvalReference:settings.approvalReference,checkoutEnabled:settings.checkoutEnabled,kountEnabled:settings.kountEnabled,voidEnabled:settings.voidEnabled,refundEnabled:settings.refundEnabled,partialRefunds:settings.partialRefunds,moneyMethods:settings.moneyMethods,maxAmountMinor:settings.maxAmountMinor}})
  }catch{return null}
}
/** Read-only merchant access for the recovery operator during the reconcile stage; money calls are refused. */
export function recoveryReadGateway(input:PolicySnapshot):MayaGateway|null{
  try{
    const environment=parseEnvironment(process.env)
    if(environment.operationMode!=='reconcile')return null
    const policy=parseRuntimePolicy(input,['maya']),settings=schema.parse(policy.sections.maya)
    if(settings.environment!==environment.mayaEnvironment)return null
    const gateway=createMayaGateway({environment:environment.mayaEnvironment,appEnv:environment.appEnv,appUrl:environment.appUrl,publicKey:process.env.MAYA_PUBLIC_KEY||'',secretKey:process.env.MAYA_SECRET_KEY||'',timeoutMs:settings.timeoutMs,capabilities:{environment:settings.environment,approvalReference:settings.approvalReference,checkoutEnabled:false,kountEnabled:false,voidEnabled:false,refundEnabled:false,partialRefunds:false,moneyMethods:[],maxAmountMinor:settings.maxAmountMinor}})
    return {...gateway,createCheckout:async()=>({kind:'refused',reason:'configuration'}),refundPayment:async()=>({kind:'refused',reason:'configuration'}),voidPayment:async()=>({kind:'refused',reason:'configuration'})}
  }catch{return null}
}
