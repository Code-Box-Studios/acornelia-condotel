import type {Metadata} from 'next'
import {Suspense} from 'react'
import LoadingSurface from '@/components/LoadingSurface'
import {RoomList} from '@/components/RoomList'
import {BookingSearch} from '@/components/BookingSearch'
import {propertyToday} from '@/domain/shared/dates'
export const metadata:Metadata={title:'Our stays'}
export default async function Rooms(){return <main id="main" className="shell page-body"><header className="page-heading"><p className="eyebrow">Settle in, slow down</p><h1>Find your little escape.</h1><p>A space to call yours, for a little while. Explore our stays and choose your dates.</p></header><BookingSearch today={propertyToday(process.env.PROPERTY_TIMEZONE||'UTC')}/><section className="section" aria-label="Our room types"><Suspense fallback={<LoadingSurface/>}><RoomList/></Suspense></section></main>}
