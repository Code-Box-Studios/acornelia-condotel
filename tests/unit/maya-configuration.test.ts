import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {syntheticRecovery} from '../support/recovery-policy'
import {configuredMayaGateway} from '@/integrations/maya/configured'
import type {PolicySnapshot} from '@/domain/policy/types'
function policy():PolicySnapshot{return {id:'11111111-1111-4111-8111-111111111111',revision:1,synthetic:true,approvedSections:['work','maya','checkout','paymentRecovery'],sections:{paymentRecovery:syntheticRecovery(),checkout:{payment:'full',holdMinutes:15,thirdPartyBookings:true},work:{leaseSeconds:30,maxAttempts:3,maxBatch:5,backoffSeconds:[5,30],runSeconds:10},maya:{environment:'sandbox',approvalReference:'synthetic-merchant-capability',checkoutEnabled:true,kountEnabled:false,voidEnabled:false,refundEnabled:false,partialRefunds:false,moneyMethods:[],maxAmountMinor:'1000000',timeoutMs:1000,checkoutMethods:['card'],methodConfigurationReference:'synthetic-merchant-method-evidence'}}}}
beforeEach(()=>{for(const [key,value] of Object.entries({APP_ENV:'test',APP_URL:'https://acornelia.example.test',APP_OPERATION_MODE:'normal',MAYA_ENVIRONMENT:'sandbox',MAYA_PUBLIC_KEY:'pk-synthetic-config-key',MAYA_SECRET_KEY:'sk-synthetic-config-key'}))vi.stubEnv(key,value)})
afterEach(()=>vi.unstubAllEnvs())
describe('environment-configured Maya gateway',()=>{
  it('configures only an approved supported merchant/environment with secret settings',()=>{
    const gateway=configuredMayaGateway(policy())
    expect(gateway).not.toBeNull();expect(typeof gateway?.createCheckout).toBe('function')
  })
  it('fails closed for missing secrets, approvals, methods or unsupported Kount',()=>{
    vi.stubEnv('MAYA_SECRET_KEY','');expect(configuredMayaGateway(policy())).toBeNull()
    vi.stubEnv('MAYA_SECRET_KEY','sk-synthetic-config-key')
    const missing=policy();missing.approvedSections=['work'];expect(configuredMayaGateway(missing)).toBeNull()
    const methods=policy();(methods.sections.maya as {checkoutMethods:string[]}).checkoutMethods=[];expect(configuredMayaGateway(methods)).toBeNull()
    const kount=policy();(kount.sections.maya as {kountEnabled:boolean}).kountEnabled=true;expect(configuredMayaGateway(kount)).toBeNull()
  })
  it('refuses environment swaps, quarantine and missing operating limits',()=>{
    vi.stubEnv('MAYA_ENVIRONMENT','production');expect(configuredMayaGateway(policy())).toBeNull()
    vi.stubEnv('MAYA_ENVIRONMENT','sandbox');vi.stubEnv('APP_OPERATION_MODE','quarantine');expect(configuredMayaGateway(policy())).toBeNull()
    vi.stubEnv('APP_OPERATION_MODE','normal');const invalid=policy();invalid.sections.work={};expect(configuredMayaGateway(invalid)).toBeNull()
  })
})

it('keeps authenticated reads configured while new checkout is paused or timing approval is missing',()=>{
  const paused=policy();(paused.sections.maya as {checkoutEnabled:boolean}).checkoutEnabled=false
  expect(configuredMayaGateway(paused)).toBeNull()
  expect(configuredMayaGateway(paused,{requireCheckout:false})).not.toBeNull()
  const missing=policy();missing.approvedSections=missing.approvedSections.filter(value=>value!=='paymentRecovery')
  expect(configuredMayaGateway(missing)).toBeNull()
  expect(configuredMayaGateway(missing,{requireCheckout:false})).not.toBeNull()
})
