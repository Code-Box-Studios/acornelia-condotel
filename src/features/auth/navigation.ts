'use client'
/** Cookie changes require a fresh document so cached private React state is discarded. */
export function navigateToServerPage(path:string):void{
  const destination=new URL(path,window.location.origin)
  if(destination.origin!==window.location.origin)throw new Error('Navigation must stay on this website')
  window.location.assign(destination.href)
}
