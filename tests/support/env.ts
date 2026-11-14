import {existsSync} from 'node:fs'
if(existsSync('.env')) process.loadEnvFile('.env')
process.env.APP_ENV='test'
if(process.env.TEST_DATABASE_URL) process.env.DATABASE_URL=process.env.TEST_DATABASE_URL
process.env.PAYLOAD_SECRET ||= 'isolated-test-secret-not-for-deployment-000000000000'
