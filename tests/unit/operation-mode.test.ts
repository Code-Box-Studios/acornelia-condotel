import {describe,it,expect} from 'vitest'
import {assertOperationAllowed,fenceFrom,operationAllowed,OperationFenced} from '@/config/operation-mode'
const all=['public-read','provider-intake','recovery','authentication','private-link','business-write','worker','outbound-money','outbound-email'] as const
describe('external operation fence',()=>{
 it('fails closed when the mode is missing or unknown',()=>{
  expect(fenceFrom({},'1').mode).toBe('quarantine');expect(()=>fenceFrom({APP_OPERATION_MODE:'open'},'1')).toThrow()
  for(const operation of all)expect(operationAllowed(operation,fenceFrom({},'1'))).toBe(['public-read','provider-intake'].includes(operation))
 })
 it('allows only reconciliation and intake during the reconcile stage',()=>{
  const fence=fenceFrom({APP_OPERATION_MODE:'reconcile',APP_RECOVERY_GENERATION:'2'},'1')
  for(const operation of all)expect(operationAllowed(operation,fence)).toBe(['public-read','provider-intake','recovery'].includes(operation))
 })
 it('keeps a restored database fenced in normal mode until its generation matches the external fence',()=>{
  const restored=fenceFrom({APP_OPERATION_MODE:'normal',APP_RECOVERY_GENERATION:'2'},'1'),missing=fenceFrom({APP_OPERATION_MODE:'normal',APP_RECOVERY_GENERATION:'2'},null)
  for(const fence of [restored,missing])for(const operation of ['authentication','private-link','business-write','worker','outbound-money','outbound-email'] as const)expect(()=>assertOperationAllowed(operation,fence)).toThrow(OperationFenced)
  const current=fenceFrom({APP_OPERATION_MODE:'normal',APP_RECOVERY_GENERATION:'2'},'2')
  for(const operation of all)expect(operationAllowed(operation,current)).toBe(operation!=='recovery')
 })
 it('defaults the external generation to 1 for a fresh install',()=>{expect(operationAllowed('authentication',fenceFrom({APP_OPERATION_MODE:'normal'},'1'))).toBe(true)})
})
