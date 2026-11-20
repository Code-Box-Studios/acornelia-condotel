import {describe,expect,it} from 'vitest'
import {fieldDate,fromIsoDate,nightsBetweenDates,spokenDate,stayRange,toIsoDate} from '@/lib/calendar-dates'
describe('calendar dates',()=>{
  it('round-trips plain YYYY-MM-DD values through local calendar days',()=>{
    const date=fromIsoDate('2027-05-10')!
    expect([date.getFullYear(),date.getMonth(),date.getDate(),date.getHours()]).toEqual([2027,4,10,0])
    expect(toIsoDate(date)).toBe('2027-05-10')
    expect(toIsoDate(new Date(2027,0,3))).toBe('2027-01-03')
  })
  it('ignores missing, malformed and impossible dates',()=>{
    for(const value of [undefined,null,'','2027-5-10','10/05/2027','2027-02-30','2027-13-01','2027-05-10T00:00:00Z'])expect(fromIsoDate(value)).toBeUndefined()
  })
  it('formats field values and spoken day names without depending on the browser locale data',()=>{
    expect(fieldDate(new Date(2027,8,7))).toBe('Sep 7, 2027')
    expect(spokenDate(new Date(2027,4,10))).toBe('Monday, May 10, 2027')
  })
  it('shortens a stay range while keeping both ends readable',()=>{
    expect(stayRange(new Date(2027,4,10),new Date(2027,4,12))).toBe('May 10 – 12, 2027')
    expect(stayRange(new Date(2027,4,30),new Date(2027,5,2))).toBe('May 30 – Jun 2, 2027')
    expect(stayRange(new Date(2026,11,30),new Date(2027,0,2))).toBe('Dec 30, 2026 – Jan 2, 2027')
  })
  it('counts nights between calendar days, including across daylight-saving changes',()=>{
    expect(nightsBetweenDates(new Date(2027,4,10),new Date(2027,4,12))).toBe(2)
    expect(nightsBetweenDates(new Date(2027,2,13),new Date(2027,2,15))).toBe(2)
    expect(nightsBetweenDates(new Date(2027,10,6),new Date(2027,10,8))).toBe(2)
  })
})
