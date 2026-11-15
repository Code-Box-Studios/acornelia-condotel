'use client'
export function clearCheckoutBrowserState(broadcast=true):void{
  try{sessionStorage.removeItem('acornelia-checkout-pending');sessionStorage.removeItem('acornelia-last-checkout')}catch{/* Server cookies and access checks remain authoritative. */}
  if(broadcast)try{const channel=new BroadcastChannel('acornelia-checkout');channel.postMessage({kind:'signed-out'});channel.close()}catch{/* A fresh document still clears this tab's private React state. */}
}
/** Cookie changes require a fresh document so cached private React state is discarded. */
export function navigateToServerPage(path:string):void{
  const destination=new URL(path,window.location.origin)
  if(destination.origin!==window.location.origin)throw new Error('Navigation must stay on this website')
  window.location.assign(destination.href)
}
