import {existsSync} from 'node:fs'
// Sandbox settings come from the operator's protected shell or a git-ignored .env.sandbox file.
// The local .env is never loaded here, so a sandbox run cannot fall back to development values.
if(existsSync('.env.sandbox'))process.loadEnvFile('.env.sandbox')
