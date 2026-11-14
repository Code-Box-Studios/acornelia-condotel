'use client'
import {useRef} from 'react'
import Image from 'next/image'
import type {PublicImage} from '@/content/public-property'
export function RoomGallery({images,name}:{images:PublicImage[];name:string}){
  const dialog=useRef<HTMLDialogElement>(null)
  if(images.length===0)return <div className="detail-hero image-empty">Room photography is on its way.</div>
  return <><div className="detail-hero"><Image src={images[0].url} alt={images[0].alt} fill loading="eager" fetchPriority="high" sizes="100vw" unoptimized/><button className="button gallery-button" onClick={()=>dialog.current?.showModal()}>View all photos <span aria-hidden="true">↗</span></button></div><dialog ref={dialog} className="gallery-dialog" aria-label={`${name} photos`} onClick={event=>{if(event.currentTarget===event.target)dialog.current?.close()}}><div className="dialog-top"><h2>{name}</h2><button type="button" className="icon-button" aria-label="Close photos" onClick={()=>dialog.current?.close()}>×</button></div>{images.map(image=><Image key={image.id} src={image.url} alt={image.alt} width={image.width||1200} height={image.height||800} sizes="90vw" unoptimized/>)}</dialog></>
}
