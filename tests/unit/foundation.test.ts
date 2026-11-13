import { describe, expect, it } from 'vitest'
import { parseMoney, addMoney } from '@/domain/shared/money'
import { parsePropertyDate, nightsBetween, propertyToday } from '@/domain/shared/dates'
import { parseApprovedPolicy } from '@/domain/policy/parse'
import { parseEnvironment } from '@/config/env'

describe('exact money', () => {
  it('preserves amounts beyond JavaScript safe integer range', () => {
    expect(parseMoney({ minor: '9007199254740993', currency: 'PHP' })).toEqual({ minor: '9007199254740993', currency: 'PHP' })
    expect(addMoney({minor:'9007199254740993',currency:'PHP'},{minor:'7',currency:'PHP'}).minor).toBe('9007199254741000')
  })
  it.each(['1.5', '-1', '01', '1e3', '', 'NaN'])('rejects invalid minor units %s', minor => {
    expect(() => parseMoney({ minor, currency: 'PHP' })).toThrow()
  })
  it('rejects cross-currency addition', () => {
    expect(() => addMoney({minor:'10',currency:'PHP'},{minor:'10',currency:'USD'})).toThrow()
  })
})
describe('property calendar', () => {
  it('uses real dates and whole-night half-open intervals', () => {
    expect(parsePropertyDate('2028-02-29')).toBe('2028-02-29')
    expect(nightsBetween('2028-02-28','2028-03-01')).toBe(2)
    expect(nightsBetween('2026-12-31','2027-01-01')).toBe(1)
  })
  it.each(['2026-02-29','2026-13-01','2026-11-31','11/13/2026','2026-11-13T00:00:00Z'])('rejects invalid date %s', value => {
    expect(() => parsePropertyDate(value)).toThrow()
  })
  it('uses the property timezone across midnight rather than the browser date', () => {
    expect(propertyToday('Asia/Manila',new Date('2026-11-12T16:00:00Z'))).toBe('2026-11-13')
    expect(propertyToday('Asia/Manila',new Date('2026-11-12T15:59:59Z'))).toBe('2026-11-12')
  })
})
describe('approved policy and environment', () => {
  it('rejects synthetic policies and missing section approvals', () => {
    expect(() => parseApprovedPolicy({id:'fixture',revision:1,synthetic:true,approvedSections:['booking'],sections:{}},['booking'])).toThrow()
    expect(() => parseApprovedPolicy({id:'policy',revision:1,approvedSections:[],sections:{}},['booking'])).toThrow()
  })
  it('accepts explicitly approved non-synthetic policy sections', () => {
    expect(parseApprovedPolicy({id:'policy',revision:1,approvedSections:['booking'],sections:{booking:{currency:'PHP'}}},['booking']).revision).toBe(1)
  })
  it('rejects mixed environments and unsafe production configuration', () => {
    expect(() => parseEnvironment({APP_ENV:'preview',APP_URL:'https://preview.example.test',MAYA_ENVIRONMENT:'production'})).toThrow()
    expect(() => parseEnvironment({APP_ENV:'production',APP_URL:'http://localhost:3042'})).toThrow()
  })
  it('starts local configuration in an explicit environment with no live payment default', () => {
    const env=parseEnvironment({APP_ENV:'development',APP_URL:'http://localhost:3042',APP_OPERATION_MODE:'normal'})
    expect(env.appEnv).toBe('development')
    expect(env.mayaEnvironment).toBe('sandbox')
    expect(env.operationMode).toBe('normal')
  })
})
