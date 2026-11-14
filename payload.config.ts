import { buildConfig } from 'payload'
import { postgresAdapter, type PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { unconfiguredEmailAdapter } from './src/email/unconfigured'
import {withStaffAudit,failedOperation} from './src/payload/hooks/audit'
import { Customers } from './src/payload/collections/Customers'
import { StaffUsers } from './src/payload/collections/StaffUsers'
import { Rooms } from './src/payload/collections/Rooms'
import { Bookings } from './src/payload/collections/Bookings'
import { Allocations } from './src/payload/collections/Allocations'
import { OfferAllocations } from './src/payload/collections/OfferAllocations'
import { PaymentAttempts } from './src/payload/collections/PaymentAttempts'
import { PaymentTransactions } from './src/payload/collections/PaymentTransactions'
import { AuditEntries } from './src/payload/collections/AuditEntries'
import { WorkItems } from './src/payload/collections/WorkItems'
const dirname=path.dirname(fileURLToPath(import.meta.url))
export function createPayloadConfig(databaseUrl=process.env.DATABASE_URL,driver?:PostgresAdapterArgs['pg']){return buildConfig({
  secret:process.env.PAYLOAD_SECRET || '',
  cookiePrefix:'acornelia',email:unconfiguredEmailAdapter,graphQL:{disable:true},
  serverURL:process.env.APP_URL || 'http://localhost:3042',
  admin:{user:'staff-users',importMap:{baseDir:dirname}},
  collections:[StaffUsers,Customers,Rooms,Bookings,Allocations,OfferAllocations,PaymentAttempts,PaymentTransactions,AuditEntries,WorkItems].map(withStaffAudit), editor:lexicalEditor(),sharp,
  db:postgresAdapter({pg:driver,pool:{connectionString:databaseUrl,max:8},idType:'uuid',push:false,disableCreateDatabase:true,migrationDir:path.resolve(dirname,'src/migrations'),transactionOptions:{isolationLevel:'serializable'}}),
  typescript:{outputFile:path.resolve(dirname,'src/payload-types.ts')},
  csrf:[process.env.APP_URL || 'http://localhost:3042'],
  cors:[process.env.APP_URL || 'http://localhost:3042'],
  hooks:{afterError:[failedOperation]},telemetry:false,
})}
export default createPayloadConfig()
