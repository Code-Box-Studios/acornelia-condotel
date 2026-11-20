import {expect,type Locator,type Page} from '@playwright/test'
const months=['January','February','March','April','May','June','July','August','September','October','November','December']
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
function parts(iso:string){const [year,month,day]=iso.split('-').map(Number);return {year,month,day}}
/** The calendar's spoken day name, such as "Monday, May 10, 2027". */
export function dayName(iso:string){const {year,month,day}=parts(iso);return `${weekdays[new Date(Date.UTC(year,month-1,day)).getUTCDay()]}, ${months[month-1]} ${day}, ${year}`}
/** The date shown in a closed date field, such as "May 10, 2027". */
export function fieldDate(iso:string){const {year,month,day}=parts(iso);return `${months[month-1].slice(0,3)} ${day}, ${year}`}
/** The button that opens a date field's calendar. Its accessible name is the field label followed by the chosen date. */
export function dateField(page:Page,label:string){return page.locator('[data-slot=date-trigger]').and(page.getByRole('button',{name:new RegExp('^'+escape(label)+' ')}))}
export const openCalendar=(page:Page)=>page.locator('[data-slot=popover-content][data-state=open]')
async function showMonth(calendar:Locator,iso:string){
  const {year,month}=parts(iso),target=year*12+month-1
  for(let step=0;step<60;step++){
    const [name,shownYear]=(await calendar.getByRole('grid').first().getAttribute('aria-label'))!.split(' '),first=Number(shownYear)*12+months.indexOf(name),count=await calendar.getByRole('grid').count()
    if(target>=first&&target<first+count)return
    await calendar.getByRole('button',{name:target<first?'Go to the Previous Month':'Go to the Next Month'}).click()
  }
  throw new Error('The calendar did not reach '+iso)
}
/** Picks a day in the calendar that is already open, paging between months as needed. */
export async function chooseDay(page:Page,iso:string){
  const calendar=openCalendar(page)
  await expect(calendar).toBeVisible()
  await showMonth(calendar,iso)
  await calendar.getByRole('button',{name:new RegExp('^'+escape(dayName(iso))+'(,|$)')}).click()
}
/** Opens a date field's calendar, unless it is open already, and picks the day. */
export async function pickDate(page:Page,label:string,iso:string){
  const field=dateField(page,label)
  if(await field.getAttribute('aria-expanded')!=='true')await field.click()
  await chooseDay(page,iso)
}
/** Picks a stay in one calendar: the arrival day first, then the departure day. */
export async function pickStay(page:Page,arrival:string,departure:string,labels:[string,string]=['Check in','Check out']){
  await pickDate(page,labels[0],arrival)
  if(await openCalendar(page).count())await chooseDay(page,departure)
  else await pickDate(page,labels[1],departure)
  await expect(openCalendar(page)).toHaveCount(0)
}
