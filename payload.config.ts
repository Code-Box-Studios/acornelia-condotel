import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { StaffUsers } from './src/payload/collections/StaffUsers'
const dirname=path.dirname(fileURLToPath(import.meta.url))
export default buildConfig({
  secret:process.env.PAYLOAD_SECRET || '',
  serverURL:process.env.APP_URL || 'http://localhost:3042',
  admin:{user:'staff-users',importMap:{baseDir:dirname}},
  collections:[StaffUsers], editor:lexicalEditor(),sharp,
  db:postgresAdapter({pool:{connectionString:process.env.DATABASE_URL,max:8},idType:'uuid',push:false,disableCreateDatabase:true,migrationDir:path.resolve(dirname,'src/migrations'),transactionOptions:{isolationLevel:'serializable'}}),
  typescript:{outputFile:path.resolve(dirname,'src/payload-types.ts')},
  csrf:[process.env.APP_URL || 'http://localhost:3042'],
  cors:[process.env.APP_URL || 'http://localhost:3042'],
  telemetry:false,
})
