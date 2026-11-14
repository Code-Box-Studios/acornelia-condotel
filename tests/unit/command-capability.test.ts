import {expect,it} from 'vitest'
import type {PayloadRequest} from 'payload'
import {commandActor,trustCommand} from '@/payload/access/internal'
it('preserves authority through a transparent query proxy without granting it to a copied request',()=>{
  const req={context:{},headers:new Headers()} as PayloadRequest
  trustCommand(req,{kind:'anonymous'})
  expect(commandActor(new Proxy(req,{}))).toEqual({kind:'anonymous'})
  expect(commandActor({...req})).toBeUndefined()
  expect(commandActor({context:{actor:{kind:'system',purpose:'payments'}}} as unknown as PayloadRequest)).toBeUndefined()
})
