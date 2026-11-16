import {AccountShell} from '@/components/AccountShell'
import {ClaimForm} from '@/features/customer/ClaimForm'
export const metadata={title:'Reviewed booking claim',robots:{index:false,follow:false}}
export default function Claim(){return <AccountShell title="A reviewed booking claim." description="This private link follows an authorized independent booking review."><ClaimForm/></AccountShell>}
