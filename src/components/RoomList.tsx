import {readRoomCatalog} from '@/content/catalog'
import {RoomCard} from './RoomCard'
export async function RoomList({limit=100}:{limit?:number}){const rooms=await readRoomCatalog();return rooms.length?<div className="rooms-grid">{rooms.slice(0,limit).map(room=><RoomCard key={room.id} room={room}/>)}</div>:<div className="status-panel"><h2>A little patience.</h2><p>Our room information is being prepared. Check back soon for approved details.</p></div>}
