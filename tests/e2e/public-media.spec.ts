import '../support/env'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {createMediaStore} from '@/media/store'
let h:TestHarness
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')
test.beforeAll(async()=>{h=await createHarness()})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('a known image URL cannot bypass draft media access, and withdrawal takes effect',async({request})=>{
  await h.reset()
  const user=await h.seed('staff-users',{name:'Media fixture',email:'media@example.test',password:'Synthetic-media-fixture-935!',role:'staff'})
  const store=createMediaStore(h.payload),actor={kind:'staff' as const,collection:'staff-users' as const,id:user.id,role:'staff' as const}
  const image=await store.put(actor,{bytes:pixel,filename:'private-fixture.png',mimeType:'image/png',alt:'Synthetic pixel',source:'Test fixture',license:'Project-created fixture',accessClass:'private',synthetic:true})
  try{
    const privateFile=await request.get(image.url!)
    expect(privateFile.status()).toBe(403)
    expect((await request.get(`/api/media/${image.id}`)).ok()).toBe(false)
    await h.payload.update({collection:'media',id:image.id,data:{accessClass:'public'},user:{...user,collection:'staff-users'},overrideAccess:false})
    const published=await request.get(image.url!)
    expect(published.ok()).toBe(true)
    expect(published.headers()['content-type']).toContain('image/png')
    await h.payload.update({collection:'media',id:image.id,data:{accessClass:'private'},user:{...user,collection:'staff-users'},overrideAccess:false})
    expect((await request.get(image.url!)).status()).toBe(403)
  }finally{await store.remove(actor,image.id)}
})
