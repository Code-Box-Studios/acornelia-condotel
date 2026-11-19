export type LifecycleAction=
 |{kind:'update-name';name:string}
 |{kind:'change-email';email:string;evidenceReference:string}
 |{kind:'deactivate';reason:string}
 |{kind:'anonymize';reason:string}
 |{kind:'remove-staff';reason:string}
 |{kind:'release-recovery-hold';evidenceReference:string;collection?:'customers'|'staff-users'}
export type LifecycleState='active'|'deactivated'|'anonymized'|'removed'
export type LifecycleResult={collection:'customers'|'staff-users';id:string;state:LifecycleState;securityRevision:number}
export type RevocationSubject={collection:'customers'|'staff-users';id:string}
