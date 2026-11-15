import {generateKeyPairSync,sign} from 'node:crypto'
import type {MayaSignatureConfig} from '@/integrations/maya/signature'
const pair=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
const keys=[pair(),pair()],wrong=pair(),now='2026-11-15T10:00:00.000Z'
const config:MayaSignatureConfig={environment:'sandbox',keyEnvironment:'sandbox',publicKeys:[keys[0].publicKey,keys[1].publicKey],toleranceMs:300000}
const payment={id:'11111111-1111-4111-8111-111111111111',requestReferenceNumber:'ACN_WEBHOOK',status:'PAYMENT_SUCCESS',amount:123.45,currency:'PHP',isPaid:true,canRefund:true,fundSource:{type:'card',details:{masked:'5555********4444'}},unused:null,empty:''}
// Independent, literal signing input follows Maya's published flattened/sorted example.
const input='amount=123.45&canRefund=true&currency=PHP&fundSource.details.masked=5555********4444&fundSource.type=card&id=11111111-1111-4111-8111-111111111111&isPaid=true&requestReferenceNumber=ACN_WEBHOOK&status=PAYMENT_SUCCESS&nonce=abcdef1234567890abcdef1234567890'
function headers(index=0,timestamp=Date.parse(now),key=keys[index].privateKey){return new Headers({'x-maya-webhook-signature':'nonce=abcdef1234567890abcdef1234567890,v1='+sign('RSA-SHA256',Buffer.from(input),key).toString('hex'),'x-maya-webhook-timestamp':String(timestamp)})}
const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value))

export {config,keys,wrong,payment,input,headers,bytes,now}
