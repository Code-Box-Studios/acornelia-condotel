/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. MODIFY AT YOUR OWN RISK. */
import config from '@payload-config'
import { fenced } from '@/http/fence'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

export const GET = fenced('authentication', REST_GET(config))
export const POST = fenced('authentication', REST_POST(config))
export const DELETE = fenced('authentication', REST_DELETE(config))
export const PATCH = fenced('authentication', REST_PATCH(config))
export const PUT = fenced('authentication', REST_PUT(config))
export const OPTIONS = REST_OPTIONS(config)
