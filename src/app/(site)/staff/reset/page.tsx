import {AccountShell} from '@/components/AccountShell'
import {StaffResetForm} from '@/features/auth/StaffResetForm'
export const metadata={title:'Staff password recovery',robots:{index:false,follow:false}}
export default function StaffReset(){return <AccountShell eyebrow="Acornelia staff" title="A new staff password." description="Use your private recovery link to update your staff password."><StaffResetForm/></AccountShell>}
