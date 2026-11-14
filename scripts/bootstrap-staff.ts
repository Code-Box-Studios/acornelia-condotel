import {existsSync} from 'node:fs'
import {getPayload} from 'payload'
import {PayloadUnitOfWork} from '../src/domain/db/unit-of-work'

async function bootstrap(){
  if(existsSync('.env'))process.loadEnvFile('.env')
  const value=process.env.DATABASE_URL
  if(!value)throw new Error('DATABASE_URL is required')
  const url=new URL(value)
  if(!['development','test'].includes(process.env.APP_ENV||'')||url.hostname!=='127.0.0.1'||url.port!=='55432'||!['/acornelia_dev','/acornelia_test'].includes(url.pathname))throw new Error('This bootstrap procedure permits only the isolated local target')
  const email=process.env.BOOTSTRAP_ADMIN_EMAIL||'codeboxstudios.official@gmail.com'
  const password=process.env.BOOTSTRAP_ADMIN_PASSWORD
  if(!password||password.length<16)throw new Error('Set a protected BOOTSTRAP_ADMIN_PASSWORD with at least 16 characters')
  const config=(await import('../payload.config')).default
  const payload=await getPayload({config})
  try{
    await new PayloadUnitOfWork(payload).run({kind:'system',purpose:'recovery'},async({req,actor})=>{
      const existing=await payload.count({collection:'staff-users',overrideAccess:true,req})
      if(existing.totalDocs!==0)throw new Error('Bootstrap refuses to replace or promote existing staff')
      const user=await payload.create({collection:'staff-users',data:{email,password,name:process.env.BOOTSTRAP_ADMIN_NAME||'Acornelia operator',role:'developer'},overrideAccess:true,req})
      await payload.create({collection:'audit-entries',data:{actor,action:'staff:bootstrap',recordType:'staff-user',recordId:user.id,outcome:'success',safeChanges:{role:'developer',source:'local-operator-cli'}},overrideAccess:false,req})
    })
    console.info('Initial local operator created with its protected audit entry. Credentials were not printed.')
  }finally{await payload.destroy()}
}
bootstrap().then(()=>process.exit(0),error=>{console.error(error instanceof Error?error.message:'Bootstrap failed');process.exit(1)})
