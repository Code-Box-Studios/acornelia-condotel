import {randomUUID} from 'node:crypto'
import type {BookingMailSnapshot,Sender,TransactionalMessage} from './types'
export const CONFIRMATION_CC='codeboxstudios.official@gmail.com'
export function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function message(kind:TransactionalMessage['kind'],from:Sender,to:string[],subject:string,paragraphs:string[],url?:string):TransactionalMessage{
  const text=paragraphs.join('\n\n')+(url?'\n\n'+url:'')
  return {id:randomUUID(),kind,from,to,cc:[],subject,text,html:'<!doctype html><html><body>'+paragraphs.map(value=>'<p>'+escapeHtml(value)+'</p>').join('')+(url?'<p><a href="'+escapeHtml(url)+'">Open your private link</a></p>':'')+'</body></html>'}
}
function summary(input:BookingMailSnapshot){const amount=BigInt(input.total.minor);return ['Hello '+input.name+'.','Your booking '+input.code+' is confirmed.',input.room+': '+input.arrival+' to '+input.departure+' ('+input.timezone+').',input.adults+' adults, '+input.children+' children.','Accepted stay total: '+(amount/100n)+'.'+(amount%100n).toString().padStart(2,'0')+' '+input.total.currency+'.','Keep your booking code for enquiries. A code or email copy does not establish account ownership.']}
export function bookingConfirmation(input:BookingMailSnapshot,sender:Sender):TransactionalMessage{return {...message('booking',sender,[input.recipient],'Acornelia booking '+input.code,summary(input)),cc:[CONFIRMATION_CC]}}
export function privateBookingMessage(input:BookingMailSnapshot,sender:Sender,url:string):TransactionalMessage{return message('booking-view',sender,[input.recipient],'Your private Acornelia booking link',summary(input).concat('This link shows one booking. It cannot claim a booking or sign in to an account. Do not forward it.'),url)}
export function authMessage(input:{purpose:'verify'|'reset';recipient:string;name:string;token:string},sender:Sender,origin:string):TransactionalMessage{
  const url=new URL(input.purpose==='verify'?'/account/activate':'/account/reset',origin);url.hash=new URLSearchParams({token:input.token}).toString()
  return message('auth',sender,[input.recipient],input.purpose==='verify'?'Activate your Acornelia account':'Reset your Acornelia password',['Hello '+input.name+'.',input.purpose==='verify'?'Choose your password to activate your customer account.':'Use this private, expiring link to choose a new password.','If you did not request this, you can ignore this email.'],url.href)
}
export function claimMessage(input:{recipient:string;approvalId:string;token:string},sender:Sender,origin:string):TransactionalMessage{
  const url=new URL('/account/claim',origin);url.hash=new URLSearchParams({approvalId:input.approvalId,token:input.token}).toString()
  return message('claim',sender,[input.recipient],'Your reviewed Acornelia booking claim',['This private link follows an authorized independent booking review. Sign in to the approved customer account to complete the claim.','A confirmation copy or matching email alone cannot claim a booking.'],url.href)
}
export function staffResetMessage(input:{recipient:string;name:string;token:string},sender:Sender,origin:string):TransactionalMessage{
  const url=new URL('/staff/reset',origin);url.hash=new URLSearchParams({token:input.token}).toString()
  return message('staff-reset',sender,[input.recipient],'Reset your Acornelia staff password',['Hello '+input.name+'.','Use this private, expiring link to reset your staff password. If you did not request it, ignore this email.'],url.href)
}
export function operationalMessage(kind:'enquiry'|'payment-issue',sender:Sender,to:string[],subject:string,paragraphs:string[]):TransactionalMessage{return message(kind,sender,to,subject,paragraphs)}
