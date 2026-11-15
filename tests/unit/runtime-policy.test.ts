import {afterEach,expect,it,vi} from 'vitest'
import {parseRuntimePolicy} from '@/domain/policy/parse'
const fixture={id:'fixture',revision:1,approvedSections:['stay'],sections:{stay:{fixture:true}},synthetic:true}
afterEach(()=>vi.unstubAllEnvs())
it('permits explicit local fixture policies and refuses synthetic production approval',()=>{
  vi.stubEnv('APP_ENV','development');vi.stubEnv('DEVELOPMENT_FIXTURES','true')
  expect(parseRuntimePolicy(fixture,['stay']).synthetic).toBe(true)
  vi.stubEnv('APP_ENV','production')
  expect(()=>parseRuntimePolicy(fixture,['stay'])).toThrow()
  vi.stubEnv('APP_ENV','development');vi.stubEnv('DEVELOPMENT_FIXTURES','false')
  expect(()=>parseRuntimePolicy(fixture,['stay'])).toThrow()
})
