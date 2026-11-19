import {existsSync} from 'node:fs'
// Imported first so configuration reads the protected local environment before Payload loads.
if(existsSync('.env'))process.loadEnvFile('.env')
