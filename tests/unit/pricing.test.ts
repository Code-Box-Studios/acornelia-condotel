import {describe,expect,it} from 'vitest'
import {calculatePrice} from '@/domain/quotes/calculate'
import type {RateRules} from '@/domain/quotes/types'
const stay={arrival:'2027-02-12',departure:'2027-02-15',occupancy:{adults:3,children:1}}
const rules:RateRules={currency:'PHP',nightMinor:'10000',weekendDays:[5,6],weekendNightMinor:'12000',specialNights:[{date:'2027-02-13',minor:'15000'}],includedAdults:2,extraAdultNightMinor:'1000',childNightMinor:'500',fees:[{label:'Cleaning',kind:'fixed',value:'1000'},{label:'Nightly service',kind:'per-night',value:'100'},{label:'Service',kind:'percent',value:'500'}],taxes:[{label:'Sample tax',bps:1200}],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'}
describe('exact approved pricing formulas',()=>{
  it('calculates normal, weekend and special nights, extras, fees then tax with integer money',()=>{
    const result=calculatePrice(stay,rules)
    expect(result.subtotal).toEqual({minor:'41500',currency:'PHP'})
    expect(result.fees.minor).toBe('3375')
    expect(result.taxes.minor).toBe('5385')
    expect(result.total.minor).toBe('50260')
    expect(result.components.filter(line=>line.kind==='night').map(line=>line.amount.minor)).toEqual(['12000','15000','10000'])
  })
  it('applies one server discount before the configured fees and tax basis',()=>{
    const result=calculatePrice(stay,rules,{minor:'1500',currency:'PHP'})
    expect(result.subtotal.minor).toBe('41500');expect(result.discount.minor).toBe('1500')
    expect(result.fees.minor).toBe('3300');expect(result.taxes.minor).toBe('5196');expect(result.total.minor).toBe('48496')
    expect(calculatePrice(stay,{...rules,taxBasis:'room-after-discount'},{minor:'1500',currency:'PHP'}).taxes.minor).toBe('4800')
  })
  it('rounds each percentage line half up without floating point',()=>{
    const minimal={...rules,nightMinor:'1',weekendDays:[],specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[{label:'Half',kind:'percent' as const,value:'5000'}],taxes:[{label:'Half tax',bps:5000}]}
    const result=calculatePrice({arrival:'2028-02-29',departure:'2028-03-01',occupancy:{adults:1,children:0}},minimal)
    expect(result.fees.minor).toBe('1');expect(result.taxes.minor).toBe('1');expect(result.total.minor).toBe('3')
  })
  it('preserves amounts beyond JavaScript safe integers',()=>{
    const exact={...rules,nightMinor:'900719925474099312345',weekendDays:[],specialNights:[],includedAdults:2,fees:[],taxes:[]}
    expect(calculatePrice({arrival:'2027-12-31',departure:'2028-01-02',occupancy:{adults:1,children:0}},exact).total.minor).toBe('1801439850948198624690')
  })
  it('rejects fractional, negative, noncanonical and mismatched money instead of truncating',()=>{
    for(const value of ['-1','1.5','01','1e3'])expect(()=>calculatePrice(stay,{...rules,nightMinor:value})).toThrow()
    expect(()=>calculatePrice(stay,rules,{minor:'50000',currency:'PHP'})).toThrow()
    expect(()=>calculatePrice(stay,rules,{minor:'1',currency:'USD'})).toThrow()
  })
  it('rejects invalid calendars, duplicate specials and unsupported calculation formulas',()=>{
    expect(()=>calculatePrice({...stay,arrival:'2027-02-29'},rules)).toThrow()
    expect(()=>calculatePrice(stay,{...rules,specialNights:[...rules.specialNights,...rules.specialNights]})).toThrow()
    expect(()=>calculatePrice(stay,{...rules,rounding:'bankers'} as unknown as RateRules)).toThrow()
  })
  it('represents a zero total without inventing a payment or provider success',()=>{
    const zero={...rules,nightMinor:'0',weekendDays:[],specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[]}
    expect(calculatePrice(stay,zero).total).toEqual({minor:'0',currency:'PHP'})
  })
})
