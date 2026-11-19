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
  return (await store.put(actor,{bytes:readFileSync(`fixtures/media/${filename}`),filename,mimeType:'image/webp',alt,source:`Local concept: ${filename}`,license:'Project-generated visual concept for local review; not verified property photography. See docs/design/acornelia-image-provenance.md.',accessClass:'public',synthetic:true})).id
}
const {siteDesign,siteDesigns}=await import('../src/config/design')
const sample=siteDesigns[siteDesign].sample
const property=await payload.findGlobal({slug:'property',overrideAccess:true})
if(!property.name){
  const hero=await image(sample.heroFile,sample.heroAlt)
  await payload.updateGlobal({slug:'property',data:{_status:'published',name:'Acornelia',tagline:sample.tagline,description:sample.description,hero,synthetic:true},user,overrideAccess:false})
  await payload.updateGlobal({slug:'site-pages',data:{_status:'published',about:'A little room to slow down. This local preview introduces the proposed Acornelia experience. Property details and final photography are awaiting approval.',contact:'Planning a stay or gathering? Approved contact details will appear here.'},user,overrideAccess:false})
}else if(property.synthetic&&property.tagline!==sample.tagline&&Object.values(siteDesigns).some(design=>design.sample.tagline===property.tagline&&design.sample.description===property.description)){
  // Untouched sample copy from another design follows the selected design; edited content is preserved.
  const hero=await image(sample.heroFile,sample.heroAlt)
  await payload.updateGlobal({slug:'property',data:{_status:'published',tagline:sample.tagline,description:sample.description,hero},user,overrideAccess:false})
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
const {propertyToday}=await import('../src/domain/shared/dates')
const date=propertyToday(process.env.PROPERTY_TIMEZONE||'Asia/Manila')
const upcomingDate=new Date(Date.parse(date+'T00:00:00Z')+7*86400000).toISOString().slice(0,10)
for(const post of [
  {slug:'a-slower-kind-of-morning',title:'A slower kind of morning',type:'story' as const,summary:'A little room for the things that make a day feel good.',body:'This is a local story preview for reviewing Acornelia’s new website.\n\nFinal stories will come from the property team, with approved words and photographs.',image:'acornelia-warm-boutique-v1.webp'},
  {slug:'an-evening-to-look-forward-to',title:'An evening to look forward to',type:'event' as const,eventDate:upcomingDate,summary:'A sample announcement, imagining a little time together.',body:'This is a sample event for the local design review. It is not a real scheduled gathering.\n\nThe enquiry form demonstrates how visitors can ask about an announcement. It does not reserve a room, confirm an event or collect payment.',image:'acornelia-bright-escape-v1.webp'},
]){
  const existing=await payload.find({collection:'posts',where:{slug:{equals:post.slug}},limit:1,overrideAccess:true})
  if(existing.totalDocs)continue
  const cover=await image(post.image,'Local Acornelia concept image')
  await payload.create({collection:'posts',data:{title:post.title,slug:post.slug,type:post.type,eventDate:'eventDate' in post?post.eventDate:undefined,summary:post.summary,body:post.body,cover,synthetic:true,_status:'published'},user,overrideAccess:false})
}
console.log('Local fixture content is ready. Existing CMS content was preserved. Access details, if generated, are in protected .local/development-access.json.')
await payload.destroy()
process.exit(0)
