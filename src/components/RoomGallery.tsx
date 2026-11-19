'use client'
import Image from 'next/image'
import {ArrowUpRight} from 'lucide-react'
import type {PublicImage} from '@/content/public-property'
import {Button} from '@/components/ui/button'
import {Dialog,DialogContent,DialogTitle,DialogTrigger} from '@/components/ui/dialog'
export function RoomGallery({images,name}:{images:PublicImage[];name:string}){
  if(images.length===0)return <div className="detail-hero image-empty">Room photography is on its way.</div>
  return <div className="detail-hero"><Image src={images[0].url} alt={images[0].alt} fill loading="eager" fetchPriority="high" sizes="100vw" unoptimized/>
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="absolute right-5 bottom-5 max-[600px]:right-3 max-[600px]:bottom-3">View all photos <ArrowUpRight aria-hidden="true"/></Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[min(94vw,1100px)] max-w-[94vw] overflow-y-auto sm:max-w-[1100px]" aria-describedby={undefined}>
        <DialogTitle className="pr-12 text-2xl font-semibold tracking-tight">{name}<span className="sr-only"> photos</span></DialogTitle>
        {images.map(image=><Image key={image.id} src={image.url} alt={image.alt} width={image.width||1200} height={image.height||800} sizes="90vw" unoptimized className="block h-auto w-full rounded-md"/>)}
      </DialogContent>
    </Dialog>
  </div>
}
