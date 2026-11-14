import {notFound} from 'next/navigation'
import {readPublicProperty} from '@/content/public-property'
const labels={'house-rules':{title:'House rules',field:'houseRules'},cancellation:{title:'Cancellation',field:'cancellation'},privacy:{title:'Privacy',field:'privacy'}} as const
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return {title:labels[slug as keyof typeof labels]?.title||'Policy not found'}}
export default async function Policy({params}:{params:Promise<{slug:string}>}){const {slug}=await params,item=labels[slug as keyof typeof labels];if(!item)notFound();const property=await readPublicProperty();return <main id="main" className="shell section copy-page"><p className="eyebrow">The details of your stay</p><h1>{item.title}</h1><p>{property?.policies[item.field]||'The approved policy is being prepared. Booking will remain unavailable until the required terms are published.'}</p></main>}
