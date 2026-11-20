/**
 * Date fields submit plain YYYY-MM-DD values. The calendar works with local-midnight Date objects, so these helpers convert
 * between the two by calendar parts (never through UTC parsing) and format dates with fixed English names. The same text
 * renders on the server and in every browser, whatever locale data the runtime ships.
 */
const months=['January','February','March','April','May','June','July','August','September','October','November','December']
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const short=(date:Date)=>`${months[date.getMonth()].slice(0,3)} ${date.getDate()}`
export function fromIsoDate(value:string|null|undefined):Date|undefined{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value??'')
  if(!match)return undefined
  const [year,month,day]=match.slice(1).map(Number),date=new Date(year,month-1,day)
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:undefined
}
export function toIsoDate(date:Date):string{return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
/** For a closed date field, such as "May 10, 2027". */
export function fieldDate(date:Date):string{return `${short(date)}, ${date.getFullYear()}`}
/** For a calendar day's accessible name, such as "Monday, May 10, 2027". */
export function spokenDate(date:Date):string{return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
/** A stay from check-in to check-out, such as "May 10 – 12, 2027". */
export function stayRange(from:Date,to:Date):string{
  if(from.getFullYear()!==to.getFullYear())return `${fieldDate(from)} – ${fieldDate(to)}`
  return from.getMonth()===to.getMonth()?`${short(from)} – ${to.getDate()}, ${to.getFullYear()}`:`${short(from)} – ${short(to)}, ${to.getFullYear()}`
}
/** Nights between two calendar days. The check-out day is not a night. */
export function nightsBetweenDates(from:Date,to:Date):number{return Math.round((Date.UTC(to.getFullYear(),to.getMonth(),to.getDate())-Date.UTC(from.getFullYear(),from.getMonth(),from.getDate()))/86400000)}
