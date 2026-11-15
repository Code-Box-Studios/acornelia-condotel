import {AccountShell} from '@/components/AccountShell'
import {AccountForm} from '@/components/AccountForm'
export const metadata={title:'Activate account',robots:{index:false,follow:false}}
export default function Activate(){return <AccountShell title="Your little welcome starts here." description="Confirm your name and choose a password to finish setting up your customer account."><AccountForm mode="activate"/></AccountShell>}
