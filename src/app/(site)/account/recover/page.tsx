import {AccountShell} from '@/components/AccountShell'
import {AccountForm} from '@/components/AccountForm'
import {safeReturnPath} from '@/features/auth/checkout-handoff'
export const metadata={title:'Recover account',robots:{index:false,follow:false}}
export default async function Recover({searchParams}:{searchParams:Promise<{next?:string}>}){const params=await searchParams;return <AccountShell title="A fresh way back in." description="Enter your email to request recovery instructions."><AccountForm mode="recover" returnTo={safeReturnPath(params.next)}/></AccountShell>}
