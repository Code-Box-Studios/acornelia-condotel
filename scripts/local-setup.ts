import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
if(existsSync('.env')){
  console.info('Existing .env preserved. Local setup did not replace configuration.')
}else{
  const password=randomBytes(24).toString('hex')
  writeFileSync('.env',[
    'APP_ENV=development','APP_URL=http://localhost:3042','APP_OPERATION_MODE=normal',
    `LOCAL_DATABASE_PASSWORD=${password}`,`DATABASE_URL=postgresql://acornelia:${password}@127.0.0.1:55432/acornelia_dev`,
    `TEST_DATABASE_URL=postgresql://acornelia:${password}@127.0.0.1:55432/acornelia_test`,
    `PAYLOAD_SECRET=${randomBytes(48).toString('hex')}`,'PROPERTY_TIMEZONE=Asia/Manila','MAYA_ENVIRONMENT=sandbox',
    `WORK_RUNNER_SECRET=${randomBytes(32).toString('hex')}`,'BOOKING_CONFIRMATION_CC=codeboxstudios.official@gmail.com',
    'DEVELOPMENT_FIXTURES=true','',
  ].join('\n'),{mode:0o600,flag:'wx'})
  console.info('Protected local .env created. No hosted resources or live providers configured.')
}
