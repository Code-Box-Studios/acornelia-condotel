import {DirectCommandClosures} from './src/payload/collections/DirectCommandClosures'
import { buildConfig } from 'payload'
import { postgresAdapter, type PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { durablePayloadEmailAdapter } from './src/payload/email'
import {withStaffAudit,withGlobalStaffAudit,failedOperation} from './src/payload/hooks/audit'
import { Customers } from './src/payload/collections/Customers'
import { StaffUsers } from './src/payload/collections/StaffUsers'
import { Rooms } from './src/payload/collections/Rooms'
import { Bookings } from './src/payload/collections/Bookings'
import { Allocations } from './src/payload/collections/Allocations'
import { OfferAllocations } from './src/payload/collections/OfferAllocations'
import { PaymentAttempts } from './src/payload/collections/PaymentAttempts'
import {PaymentIssues} from './src/payload/collections/PaymentIssues'
import {PaymentInbox} from './src/payload/collections/PaymentInbox'
import { PaymentTransactions } from './src/payload/collections/PaymentTransactions'
import { AuditEntries } from './src/payload/collections/AuditEntries'
import { WorkItems } from './src/payload/collections/WorkItems'
import {Property} from './src/payload/globals/Property'
import {SitePages} from './src/payload/globals/SitePages'
import {Policies} from './src/payload/globals/Policies'
import {RoomTypes} from './src/payload/collections/RoomTypes'
import {Media} from './src/payload/collections/Media'
import {Posts} from './src/payload/collections/Posts'
import {Enquiries} from './src/payload/collections/Enquiries'
import {CheckoutDrafts} from './src/payload/collections/CheckoutDrafts'
import {AuthTokens} from './src/payload/collections/AuthTokens'
import {EmailMessages} from './src/payload/collections/EmailMessages'
import {AuthDeliveries} from './src/payload/collections/AuthDeliveries'
import {Offers} from './src/payload/collections/Offers'
import {OfferVersions} from './src/payload/collections/OfferVersions'
import {RatePlans} from './src/payload/collections/RatePlans'
import {Quotes} from './src/payload/collections/Quotes'
import {PolicyVersions} from './src/payload/collections/PolicyVersions'
import {RoomBlocks} from './src/payload/collections/RoomBlocks'
import {BookingClaims} from './src/payload/collections/BookingClaims'
import {BookingViews} from './src/payload/collections/BookingViews'
import {AuthThrottles} from './src/payload/collections/AuthThrottles'
const dirname=path.dirname(fileURLToPath(import.meta.url))
export function createPayloadConfig(databaseUrl=process.env.DATABASE_URL,driver?:PostgresAdapterArgs['pg']){return buildConfig({
  secret:process.env.PAYLOAD_SECRET || '',
  cookiePrefix:'acornelia',email:durablePayloadEmailAdapter,graphQL:{disable:true},
  serverURL:process.env.APP_URL || 'http://localhost:3042',
  admin:{user:'staff-users',importMap:{baseDir:dirname}},
  globals:[Property,SitePages,Policies].map(withGlobalStaffAudit),
  collections:[DirectCommandClosures,Offers,OfferVersions,RatePlans,Quotes,PolicyVersions,RoomBlocks,BookingClaims,BookingViews,AuthTokens,AuthDeliveries,EmailMessages,AuthThrottles,CheckoutDrafts,Posts,Enquiries,RoomTypes,Media,StaffUsers,Customers,Rooms,Bookings,Allocations,OfferAllocations,PaymentAttempts,PaymentTransactions,PaymentInbox,PaymentIssues,AuditEntries,WorkItems].map(withStaffAudit), editor:lexicalEditor(),sharp,
  db:postgresAdapter({pg:driver,pool:{connectionString:databaseUrl,max:8},idType:'uuid',push:false,disableCreateDatabase:true,migrationDir:path.resolve(dirname,'src/migrations'),transactionOptions:{isolationLevel:'serializable'}}),
  typescript:{outputFile:path.resolve(dirname,'src/payload-types.ts')},
  csrf:[process.env.APP_URL || 'http://localhost:3042'],
  cors:[process.env.APP_URL || 'http://localhost:3042'],
  hooks:{afterError:[failedOperation]},telemetry:false,
})}
export default createPayloadConfig()
