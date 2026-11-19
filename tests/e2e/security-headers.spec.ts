import '../support/env'
import {test,expect} from '@playwright/test'
// Baseline headers captured before public exposure. form-action is deliberately absent:
// the payment handoff is a same-origin form POST that redirects to Maya's checkout page.
const baseline={
 'strict-transport-security':'max-age=63072000',
 'content-security-policy':"frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
 'x-content-type-options':'nosniff',
 'x-frame-options':'SAMEORIGIN',
 'permissions-policy':'camera=(), microphone=(), geolocation=()',
}
test('sends the baseline security headers on public pages, private pages, the admin and API responses',async({request})=>{
 for(const path of ['/','/account','/admin/login','/api/identity/me']){
  const response=await request.get(path,{maxRedirects:0})
  const headers=response.headers()
  for(const [name,value] of Object.entries(baseline))expect(headers[name],path+' '+name).toBe(value)
  expect(headers['x-powered-by'],path).toBeUndefined()
 }
})
