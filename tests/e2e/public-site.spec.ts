import '../support/env'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {createMediaStore} from '@/media/store'
let h:TestHarness
const name='Public website fixture',slug='website-fixture'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{
  await h.reset()
  await h.payload.updateGlobal({slug:'property',data:{_status:'published',name,tagline:'Your own little pause',description:'Sample stay description',synthetic:true},overrideAccess:true})
  await h.seed('room-types',{_status:'published',name:'A quiet fixture room',slug,description:'A sample room for website checks',maxGuests:2,bedDescription:'One sample bed',synthetic:true})
})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('keeps mobile booking and keyboard theme controls usable',async({page})=>{
  await page.setViewportSize({width:320,height:740})
  await page.goto('/')
  const theme=page.getByRole('button',{name:/theme/i})
  await expect(theme).toBeVisible()
  await theme.focus();await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme','light')
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)
  expect(horizontalOverflow).toBe(false)
  await expect(page.getByRole('link',{name:'Plan your stay',exact:true})).toBeVisible()
  const menu=page.getByRole('button',{name:'Open navigation'})
  await menu.click()
  await expect(page.getByRole('dialog',{name:'Navigation'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(menu).toBeFocused()
})
test('discovers a room and preserves validated dates and guests in booking handoff',async({page})=>{
  await page.goto('/rooms')
  await page.getByRole('link',{name:'Explore A quiet fixture room'}).click()
  await expect(page).toHaveURL(new RegExp('/rooms/'+slug+'$'))
  await expect(page.getByRole('heading',{name:'A quiet fixture room',level:1})).toBeVisible()
  await page.getByLabel('Check in', {exact:true}).fill('2027-05-10')
  await page.getByLabel('Check out', {exact:true}).fill('2027-05-12')
  await page.getByLabel('Adults', {exact:true}).fill('2')
  await expect(page.getByLabel('Check in',{exact:true})).toHaveValue('2027-05-10')
  await expect(page.getByLabel('Check out',{exact:true})).toHaveValue('2027-05-12')
  await page.getByRole('button',{name:'Find my stay'}).click()
  await expect(page).toHaveURL(/\/book\?/)
  expect(new URL(page.url()).searchParams.get('arrival')).toBe('2027-05-10')
  expect(new URL(page.url()).searchParams.get('departure')).toBe('2027-05-12')
  expect(new URL(page.url()).searchParams.get('adults')).toBe('2')
  await expect(page.getByRole('link',{name:'Plan your stay',exact:true})).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'Your selected stay'})).toBeVisible()
})
test('rejects reversed dates without claiming availability',async({page})=>{
  await page.goto('/rooms/'+slug)
  await page.getByLabel('Check in', {exact:true}).fill('2027-05-12')
  await page.getByLabel('Check out', {exact:true}).fill('2027-05-10')
  await page.getByRole('button',{name:'Find my stay'}).click()
  await expect(page.locator('main').getByRole('alert')).toContainText('Check out must be after check in')
  expect(new URL(page.url()).pathname).toBe('/rooms/'+slug)
})
test('keeps public routes readable in both themes with reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  for(const route of ['/','/rooms','/about','/contact','/events','/policies/privacy','/policies/cancellation']){
    await page.goto(route)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page.getByRole('link',{name:'Skip to content'})).toHaveAttribute('href','#main')
    for(const theme of ['dark','light']){
      await page.evaluate(value=>{document.documentElement.dataset.theme=value},theme)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    }
  }
  expect((await page.request.get('/sitemap.xml')).ok()).toBe(true)
  expect((await page.request.get('/robots.txt')).ok()).toBe(true)
  const missing=await page.goto('/rooms/not-a-real-room')
  expect(missing?.status()).toBe(404)
})

test('returns keyboard focus after closing room photos with Escape',async({page})=>{
  const user=await h.seed('staff-users',{name:'Gallery fixture',email:'gallery@example.test',password:'Synthetic-gallery-passphrase-824!',role:'staff'})
  const store=createMediaStore(h.payload),actor={kind:'staff' as const,collection:'staff-users' as const,id:user.id,role:'staff' as const}
  const image=await store.put(actor,{bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64'),filename:'gallery-fixture.png',mimeType:'image/png',alt:'Synthetic gallery pixel',source:'Browser fixture',license:'Project-created fixture',accessClass:'public',synthetic:true})
  try{
    const room=(await h.rows('room-types'))[0]
    await h.payload.update({collection:'room-types',id:room.id,data:{gallery:[{image:image.id}]},overrideAccess:true})
    await page.goto('/rooms/'+slug)
    const photos=page.getByRole('button',{name:'View all photos'})
    await photos.focus();await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog',{name:'A quiet fixture room photos'})).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(photos).toBeFocused()
  }finally{await store.remove(actor,image.id)}
})

test('presents the selected Bright resort design with a centred masthead, panoramic photo and floating search',async({page},testInfo)=>{
  await h.seed('room-types',{_status:'published',name:'A second fixture room',slug:'second-fixture',description:'Another sample room',maxGuests:2,bedDescription:'One sample bed',synthetic:true})
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-design','bright')
  const headline=page.locator('.hero h1')
  await expect(headline).toContainText('A little escape.');await expect(headline).toContainText('A brighter day.')
  expect(await page.locator('.hero-copy').evaluate(element=>getComputedStyle(element).textAlign)).toBe('center')
  const visual=(await page.locator('.hero-visual').boundingBox())!,search=(await page.locator('#find-stay').boundingBox())!
  if(testInfo.project.name==='desktop'){
    expect(visual.width/visual.height).toBeGreaterThan(2)
    // The date search floats over the lower edge of the panoramic photo.
    expect(search.y).toBeLessThan(visual.y+visual.height)
    const cards=page.locator('.rooms-grid .room-card'),first=(await cards.nth(0).boundingBox())!,second=(await cards.nth(1).boundingBox())!
    expect(second.y-first.y).toBeGreaterThan(40)
  }else{
    expect(search.y).toBeGreaterThanOrEqual(visual.y+visual.height)
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('keeps key text and button colors readable in both themes',async({page})=>{
  await page.goto('/')
  for(const theme of ['light','dark']){
    const ratios=await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme
      function luminance(color:string){const channels=color.match(/[\d.]+/g)!.slice(0,3).map(x=>{const c=Number(x)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722}
      const background=getComputedStyle(document.body).backgroundColor
      return ['.hero .eyebrow','.hero-description','.hero-actions [data-slot=button]'].map(selector=>{const style=getComputedStyle(document.querySelector(selector)!);const a=luminance(style.color),b=luminance(selector.includes('button')?style.backgroundColor:background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})
    },theme)
    for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5)
  }
})
