import {existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
if(existsSync('.env'))process.loadEnvFile('.env')
const value=process.env.TEST_DATABASE_URL
if(!value)throw new Error('TEST_DATABASE_URL is required for the isolated browser server')
const database=new URL(value)
if(database.hostname!=='127.0.0.1'||database.port!=='55432'||database.pathname!=='/acornelia_test')throw new Error('Browser server refused a non-isolated target')
const child=spawn(process.execPath,[fileURLToPath(import.meta.resolve('next/dist/bin/next')),'dev','--hostname','127.0.0.1','--port','3043'],{
  stdio:'inherit',env:{...process.env,DATABASE_URL:value,APP_ENV:'test',APP_URL:'http://127.0.0.1:3043',APP_OPERATION_MODE:'normal',MAYA_ENVIRONMENT:'sandbox',MAYA_PUBLIC_KEY:'',MAYA_SECRET_KEY:'',EMAIL_TRANSPORT:'',E2E_MODE:'1',WORK_RUNNER_SECRET:'synthetic-browser-runner-secret-not-for-production'},
})
process.on('SIGTERM',()=>child.kill('SIGTERM'))
process.on('SIGINT',()=>child.kill('SIGINT'))
child.on('exit',code=>process.exit(code??1))
