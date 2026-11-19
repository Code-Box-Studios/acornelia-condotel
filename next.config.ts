import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
const nextConfig: NextConfig={
  poweredByHeader:false,
  outputFileTracingExcludes:{'/*':['./.local/**/*','./media/**/*','./fixtures/media/**/*']},
  logging:{incomingRequests:false},
  distDir:process.env.E2E_MODE==='1'?'.next-e2e':'.next',
  // Browsers ignore HSTS over plain HTTP, so local servers are unaffected. includeSubDomains and preload are
  // left to the domain owner. The CSP baseline restricts framing, <base> and plugins only; script and style
  // sources and form-action stay open because Next inlines scripts and the payment handoff form redirects to Maya.
  async headers(){return [{source:'/:path*',headers:[{key:'Strict-Transport-Security',value:'max-age=63072000'},{key:'Content-Security-Policy',value:"frame-ancestors 'self'; base-uri 'self'; object-src 'none'"},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}]},
}
export default withPayload(nextConfig)
