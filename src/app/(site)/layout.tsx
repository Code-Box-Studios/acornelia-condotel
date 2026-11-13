import type { Metadata } from 'next'
export const metadata: Metadata={title:{default:'Acornelia Condotel & Events Place',template:'%s · Acornelia'},description:'Find your next stay at Acornelia Condotel & Events Place.'}
export default function SiteLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>
}
