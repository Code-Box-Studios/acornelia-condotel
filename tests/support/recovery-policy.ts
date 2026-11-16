import type {RecoveryPolicy} from '@/domain/payments/recovery-policy'
// Short provider window is a mock contract, not a claim about actual Maya configuration.
export function syntheticRecovery(overrides:Partial<RecoveryPolicy>={}):RecoveryPolicy{return {intervalSeconds:5,maxChecks:1000,escalateAfterDeadlineMinutes:30,maxBrowserResumes:2,maxOpenHolds:20,maxNewHolds:100,holdWindowMinutes:60,providerWindowMinutes:1,windowVerificationReference:'synthetic-window-test-only',terminalRelease:'at-deadline',...overrides}}
