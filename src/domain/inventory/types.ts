import type {Occupancy,Instant} from '@/domain/shared/types'
import type {PolicySnapshot} from '@/domain/policy/types'
export type StayRequest={roomTypeId?:string;arrival:string;departure:string;occupancy:Occupancy}
export type AvailableRoomType={id:string;name:string;slug:string;maxGuests:number;availableUnits:number}
export type AllocationRequest=
  |{purpose:'hold'|'booking';bookingId:string;stay:StayRequest;policy:PolicySnapshot;now:Instant;deadline?:Instant}
  |{purpose:'block';roomId:string;arrival:string;departure:string}
export type OpeningInventoryRow={roomId:string;arrival:string;departure:string;kind:'booking'|'block';externalReference:string}
export type OpeningPreview={valid:boolean;issues:{row:number;code:'invalid'|'unknown-room'|'overlap'|'duplicate-reference'}[]}
