import {AccountShell} from '@/components/AccountShell'
import {AccountForm} from '@/components/AccountForm'
import {safeReturnPath} from '@/features/auth/checkout-handoff'
export const metadata={title:'Create account',robots:{index:false,follow:false}}
export default async function Register({searchParams}:{searchParams:Promise<{next?:string}>}){const params=await searchParams;return <AccountShell title="Make yourself at home." description="We’ll send a link to confirm your email and choose your password. Creating an account is optional."><AccountForm mode="register" returnTo={safeReturnPath(params.next)}/></AccountShell>}
