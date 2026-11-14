import {existsSync} from 'node:fs'
if(existsSync('.env'))process.loadEnvFile('.env')
const value=process.env.DATABASE_URL
if(!value)throw new Error('DATABASE_URL required')
const url=new URL(value)
const local=['localhost','127.0.0.1'].includes(url.hostname)&&['/acornelia_dev','/acornelia_test'].includes(url.pathname)
if(!local)throw new Error('Hosted migrations require the reviewed release target verifier; local wrapper refused this target')
const {spawnSync}=await import('node:child_process')
const result=spawnSync('pnpm',['payload','migrate'],{stdio:'inherit',env:process.env})
process.exit(result.status??1)
