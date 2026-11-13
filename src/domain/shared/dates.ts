export function parsePropertyDate(input: unknown): string {
  if(typeof input!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith('0000')) throw new Error('Use a valid YYYY-MM-DD date')
  const date=new Date(`${input}T00:00:00.000Z`)
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==input) throw new Error('Invalid calendar date')
  return input
}
export function nightsBetween(arrival: string, departure: string): number {
  const nights=(Date.parse(parsePropertyDate(departure))-Date.parse(parsePropertyDate(arrival)))/86400000
  if(nights<=0) throw new Error('Departure must follow arrival')
  return nights
}
export function propertyToday(timezone: string, now: Date = new Date()): string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  const part=(type:string)=>parts.find(p=>p.type===type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function dateToStorage(value: string): string { return `${parsePropertyDate(value)}T00:00:00.000Z` }
