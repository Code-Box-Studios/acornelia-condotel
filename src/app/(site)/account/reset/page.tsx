import {AccountShell} from '@/components/AccountShell'
import {AccountForm} from '@/components/AccountForm'
export const metadata={title:'Choose a new password',robots:{index:false,follow:false}}
export default function Reset(){return <AccountShell title="A new password. A fresh start." description="Choose a new password. Existing sessions will be signed out."><AccountForm mode="reset"/></AccountShell>}
