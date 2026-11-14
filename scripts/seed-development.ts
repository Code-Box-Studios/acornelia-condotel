import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
if(existsSync('.env'))process.loadEnvFile('.env')
const url=new URL(process.env.DATABASE_URL||'')
if(process.env.APP_ENV!=='development'||process.env.DEVELOPMENT_FIXTURES!=='true'||!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='55432'||url.pathname!=='/acornelia_dev')throw new Error('Development seeding requires the dedicated local fixture target')
const {getPayload}=await import('payload')
const {default:config}=await import('../payload.config')
const {PayloadUnitOfWork}=await import('../src/domain/db/unit-of-work')
const {appendAudit}=await import('../src/domain/audit/append')
const {createMediaStore}=await import('../src/media/store')
const payload=await getPayload({config})
let users=await payload.find({collection:'staff-users',where:{role:{equals:'developer'}},limit:1,overrideAccess:true})
if(users.totalDocs===0){
  if((await payload.count({collection:'staff-users',overrideAccess:true})).totalDocs>0)throw new Error('Existing staff require an operator-selected content account; no promotion performed')
  const email=process.env.BOOTSTRAP_ADMIN_EMAIL||'codeboxstudios.official@gmail.com'
  const existingAccess=existsSync('.local/development-access.json')?JSON.parse(readFileSync('.local/development-access.json','utf8')):null
  if(existingAccess&&existingAccess.email!==email)throw new Error('Existing protected access file belongs to a different local operator')
  const password=existingAccess?.password||randomBytes(32).toString('base64url')
  mkdirSync('.local',{recursive:true,mode:0o700})
  // Write protected access details before creation; retry never resets an existing user.
  if(!existingAccess)writeFileSync('.local/development-access.json',JSON.stringify({email,password,url:'http://localhost:3042/admin'},null,2)+'\n',{mode:0o600,flag:'wx'})
  await new PayloadUnitOfWork(payload).run({kind:'system',purpose:'recovery'},async tx=>{
    if((await payload.count({collection:'staff-users',req:tx.req,overrideAccess:true})).totalDocs)throw new Error('Staff already exist')
    const operator=await payload.create({collection:'staff-users',data:{name:'Local developer',email,password,role:'developer'},req:tx.req,overrideAccess:true})
    await appendAudit(tx,{action:'staff:bootstrap',recordType:'staff-users',recordId:operator.id,outcome:'success',safeChanges:{role:'developer'}})
  })
  users=await payload.find({collection:'staff-users',where:{role:{equals:'developer'}},limit:1,overrideAccess:true})
}
const user={...users.docs[0],collection:'staff-users' as const},actor={kind:'staff' as const,collection:'staff-users' as const,id:user.id,role:'developer' as const}
const store=createMediaStore(payload)
async function image(filename:string,alt:string){
  const existing=await payload.find({collection:'media',where:{and:[{source:{equals:`Local concept: ${filename}`}},{status:{equals:'ready'}}]},limit:1,overrideAccess:true})
  if(existing.docs[0])return existing.docs[0].id
  return (await store.put(actor,{bytes:readFileSync(`.lavish/${filename}`),filename,mimeType:'image/webp',alt,source:`Local concept: ${filename}`,license:'Project-generated visual concept for local review; not verified property photography. See docs/design/acornelia-image-provenance.md.',accessClass:'public',synthetic:true})).id
}
const property=await payload.findGlobal({slug:'property',overrideAccess:true})
if(!property.name){
  const hero=await image('acornelia-warm-boutique-v1.webp','Concept bedroom with warm linen, olive details and soft daylight')
  await payload.updateGlobal({slug:'property',data:{_status:'published',name:'Acornelia',tagline:'Your own little pause',description:'Slow mornings. Time together. The simple pleasure of somewhere that feels like yours.',hero,synthetic:true},user,overrideAccess:false})
  await payload.updateGlobal({slug:'site-pages',data:{_status:'published',about:'A little room to slow down. This local preview introduces the proposed Acornelia experience. Property details and final photography are awaiting approval.',contact:'Planning a stay or gathering? Approved contact details will appear here.'},user,overrideAccess:false})
}
for(const room of [
  {slug:'boutique-stay',name:'The boutique stay',file:'acornelia-warm-boutique-v1.webp',alt:'Warm bedroom concept with textured fabrics and natural wood',description:'Soft textures, warm tones and room to settle in. A sample room for reviewing the booking experience.',bedDescription:'Sample double bed',maxGuests:2},
  {slug:'sunlit-stay',name:'The sunlit stay',file:'acornelia-bright-escape-v1.webp',alt:'Bright bedroom concept with pale linens and green accents',description:'An airy little escape, imagined for slow mornings and time together. Final room details await approval.',bedDescription:'Sample double bed',maxGuests:2},
]){
  const existing=await payload.find({collection:'room-types',where:{slug:{equals:room.slug}},limit:1,overrideAccess:true})
  if(existing.totalDocs)continue
  const id=await image(room.file,room.alt)
  await payload.create({collection:'room-types',data:{_status:'published',slug:room.slug,name:room.name,description:room.description,bedDescription:room.bedDescription,maxGuests:room.maxGuests,gallery:[{image:id}],synthetic:true},user,overrideAccess:false})
}
console.log('Local fixture content is ready. Existing CMS content was preserved. Access details, if generated, are in protected .local/development-access.json.')
await payload.destroy()
process.exit(0)
