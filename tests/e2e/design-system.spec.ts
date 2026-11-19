import '../support/env'
import {test,expect,type Locator} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {createMediaStore} from '@/media/store'
let h:TestHarness
const slug='design-system-fixture'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{
  await h.reset()
  await h.payload.updateGlobal({slug:'property',data:{_status:'published',name:'Design system fixture',tagline:'Make room for a little escape',description:'Sample stay description',synthetic:true},overrideAccess:true})
  await h.seed('room-types',{_status:'published',name:'A design fixture room',slug,description:'A sample room for component checks',maxGuests:2,bedDescription:'One sample bed',synthetic:true})
})
test.afterAll(async()=>{await h?.reset();await h?.close()})
// Layout height (offsetHeight) ignores the dialog's brief scale-in animation.
const measure=(locator:Locator)=>locator.evaluate(element=>{const style=getComputedStyle(element);return {radius:style.borderTopLeftRadius,height:(element as HTMLElement).offsetHeight,fontSize:Number.parseFloat(style.fontSize),fontWeight:style.fontWeight}})
// The design language (docs/superpowers/specs/2026-11-05-acornelia-design-language.md) asks for shadcn/ui components with
// 8 px corners on buttons and fields, 44 px main actions, 14 px semibold labels, 16 px field text on phones and 16 px dialogs.
test('builds guest controls from the shared component kit in the design language',async({page},testInfo)=>{
  await page.goto('/')
  const search=page.getByRole('button',{name:'Find my stay'})
  await expect(search).toHaveAttribute('data-slot','button')
  const button=await measure(search)
  expect(button).toMatchObject({radius:'8px',fontSize:14,fontWeight:'600'});expect(button.height).toBeGreaterThanOrEqual(44)
  const arrival=page.getByLabel('Check in',{exact:true})
  await expect(arrival).toHaveAttribute('data-slot','input')
  const field=await measure(arrival)
  expect(field.radius).toBe('8px');expect(field.height).toBeGreaterThanOrEqual(44)
  if(testInfo.project.name==='mobile'){
    expect(field.fontSize).toBeGreaterThanOrEqual(16)
    await page.getByRole('button',{name:'Open navigation'}).click()
    await expect(page.getByRole('dialog',{name:'Navigation'})).toHaveAttribute('data-slot','sheet-content')
  }
})
test('opens room photos in the shared dialog with 16 px corners',async({page})=>{
  const user=await h.seed('staff-users',{name:'Design gallery fixture',email:'design-gallery@example.test',password:'Synthetic-design-gallery-824!',role:'staff'})
  const store=createMediaStore(h.payload),actor={kind:'staff' as const,collection:'staff-users' as const,id:user.id,role:'staff' as const}
  const image=await store.put(actor,{bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64'),filename:'design-gallery.png',mimeType:'image/png',alt:'Synthetic design gallery pixel',source:'Browser fixture',license:'Project-created fixture',accessClass:'public',synthetic:true})
  try{
    const room=(await h.rows('room-types'))[0]
    await h.payload.update({collection:'room-types',id:room.id,data:{gallery:[{image:image.id}]},overrideAccess:true})
    await page.goto('/rooms/'+slug)
    await page.getByRole('button',{name:'View all photos'}).click()
    const dialog=page.getByRole('dialog',{name:'A design fixture room photos'})
    await expect(dialog).toHaveAttribute('data-slot','dialog-content')
    expect((await measure(dialog)).radius).toBe('16px')
    expect((await measure(dialog.getByRole('button',{name:'Close'}))).height).toBeGreaterThanOrEqual(44)
  }finally{await store.remove(actor,image.id)}
})
