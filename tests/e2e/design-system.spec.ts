import '../support/env'
import {test,expect,type Locator} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {createMediaStore} from '@/media/store'
import {chooseDay,dateField,openCalendar,pickStay} from '../support/calendar'
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
// 8 px corners on buttons and fields, 44 px main actions, 14 px semibold labels, 16 px field text on phones, 16 px dialogs
// and calendar cells of at least 32 px on the smallest phone layout.
test('builds guest controls from the shared component kit in the design language',async({page},testInfo)=>{
  await page.goto('/')
  const search=page.getByRole('button',{name:'Find my stay'})
  await expect(search).toHaveAttribute('data-slot','button')
  const button=await measure(search)
  expect(button).toMatchObject({radius:'8px',fontSize:14,fontWeight:'600'});expect(button.height).toBeGreaterThanOrEqual(44)
  const adults=page.getByLabel('Adults',{exact:true})
  await expect(adults).toHaveAttribute('data-slot','input')
  const field=await measure(adults)
  expect(field.radius).toBe('8px');expect(field.height).toBeGreaterThanOrEqual(44)
  if(testInfo.project.name==='mobile'){
    expect(field.fontSize).toBeGreaterThanOrEqual(16)
    await page.getByRole('button',{name:'Open navigation'}).click()
    await expect(page.getByRole('dialog',{name:'Navigation'})).toHaveAttribute('data-slot','sheet-content')
  }
})
// Stay dates use one range calendar (design language C-04): check-in first, then check-out, with the nights shown.
test('chooses stay dates from the shared range calendar in the design language',async({page},testInfo)=>{
  await page.goto('/')
  await expect(page.locator('input[type=date]')).toHaveCount(0)
  const checkIn=dateField(page,'Check in'),checkOut=dateField(page,'Check out')
  await expect(checkIn).toHaveAccessibleName('Check in Select date');await expect(checkIn).toHaveAttribute('aria-haspopup','dialog')
  const trigger=await measure(checkIn)
  expect(trigger.radius).toBe('8px');expect(trigger.height).toBeGreaterThanOrEqual(44)
  if(testInfo.project.name==='mobile')expect(trigger.fontSize).toBeGreaterThanOrEqual(16)
  await checkIn.click()
  const calendar=page.getByRole('dialog',{name:'Choose check in date'})
  await expect(calendar).toHaveAttribute('data-slot','popover-content');await expect(calendar.locator('[data-slot=calendar]')).toBeVisible()
  expect((await measure(calendar)).radius).toBe('16px')
  await expect(calendar.locator('[data-slot=calendar-summary]')).toHaveText('Select check in')
  await chooseDay(page,'2027-05-10')
  await expect(page.getByRole('dialog',{name:'Choose check out date'})).toBeVisible()
  await expect(openCalendar(page).locator('[data-slot=calendar-summary]')).toHaveText('Check in May 10, 2027 · select check out')
  await chooseDay(page,'2027-05-12')
  await expect(openCalendar(page)).toHaveCount(0);await expect(checkOut).toBeFocused()
  await expect(checkIn).toHaveAccessibleName('Check in May 10, 2027');await expect(checkOut).toHaveAccessibleName('Check out May 12, 2027')
  await checkOut.click()
  await expect(openCalendar(page).locator('[data-slot=calendar-summary]')).toHaveText('May 10 – 12, 2027 · 2 nights')
  await expect(openCalendar(page).getByRole('button',{name:'Tuesday, May 11, 2027, included night'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(openCalendar(page)).toHaveCount(0);await expect(checkOut).toBeFocused()
  // Calendar cells stay at least 32 px and the calendar stays on screen on the smallest phone layout.
  await page.setViewportSize({width:320,height:740});await page.reload()
  await dateField(page,'Check in').click()
  const small=openCalendar(page),box=(await small.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320)
  const cell=await measure(small.getByRole('grid').first().getByRole('button').first())
  expect(cell.height).toBeGreaterThanOrEqual(32);expect(cell.radius).toBe('8px')
  await page.keyboard.press('Escape')
  await pickStay(page,'2027-05-26','2027-05-28')
  await expect(dateField(page,'Check out')).toHaveAccessibleName('Check out May 28, 2027')
  // The chosen dates stay readable in the two-column phone layout instead of being cut off.
  for(const label of ['Check in','Check out'])expect(await dateField(page,label).locator('span').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
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
