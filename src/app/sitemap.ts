import type {MetadataRoute} from 'next'
import {readRoomCatalog} from '@/content/catalog'
export const dynamic='force-dynamic'
export default async function sitemap():Promise<MetadataRoute.Sitemap>{if(process.env.APP_ENV!=='production'||process.env.INDEX_PUBLIC_SITE!=='true')return [];const origin=process.env.APP_URL!;return ['','/rooms','/about','/contact','/events','/updates','/policies/house-rules','/policies/cancellation','/policies/privacy',...(await readRoomCatalog()).map(x=>`/rooms/${x.slug}`)].map(path=>({url:origin+path}))}
