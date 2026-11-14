import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
const nextConfig: NextConfig={
  poweredByHeader:false,
  distDir:process.env.E2E_MODE==='1'?'.next-e2e':'.next',
  async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}]},
}
export default withPayload(nextConfig)
