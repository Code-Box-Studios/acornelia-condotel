import {expect,it} from 'vitest'
import {safeReturnPath} from '@/features/auth/checkout-handoff'
it('permits only fixed account/checkout return destinations',()=>{
  expect(safeReturnPath('/book')).toBe('/book')
  expect(safeReturnPath('/account/offers')).toBe('/account/offers')
  for(const input of ['https://outside.example','//outside.example','/\\outside.example','/book?token=private','%2f%2foutside.example','/admin','/account/login',null])expect(safeReturnPath(input)).toBe('/account')
})
