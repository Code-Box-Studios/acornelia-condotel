import type {MetadataRoute} from 'next'
export default function robots():MetadataRoute.Robots{const published=process.env.APP_ENV==='production'&&process.env.INDEX_PUBLIC_SITE==='true';return {rules:{userAgent:'*',...(published?{allow:'/',disallow:['/admin','/api','/account','/book','/booking']}:{disallow:'/'})},...(published?{sitemap:`${process.env.APP_URL}/sitemap.xml`}:{})}}
