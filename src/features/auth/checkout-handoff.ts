const destinations=new Set(['/book','/account','/account/bookings','/account/offers'])
export function safeReturnPath(input:unknown):string{return typeof input==='string'&&destinations.has(input)?input:'/account'}
