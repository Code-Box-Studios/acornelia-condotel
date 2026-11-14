import {APIError,type Access,type CollectionBeforeLoginHook,type CollectionBeforeChangeHook,type PayloadRequest} from 'payload'
export function activeStaff(req:PayloadRequest):boolean{return req.user?.collection==='staff-users'&&!req.user.deactivated}
export function ownAccount(collection:'customers'|'staff-users'):Access{return ({req})=>{
  if(!req.user||req.user.collection!==collection||req.user.deactivated)return false
  return {id:{equals:req.user.id}}
}}
export const developerOnly=({req}:{req:PayloadRequest}):boolean=>activeStaff(req)&&req.user?.collection==='staff-users'&&req.user.role==='developer'
export const rejectDeactivatedLogin:CollectionBeforeLoginHook=({user})=>{
  if(user.deactivated)throw new APIError('Account unavailable',403)
  return user
}

export const revokeOnDeactivate:CollectionBeforeChangeHook=({data})=>{
  if(data.deactivated===true)return {...data,sessions:[],resetPasswordToken:null,resetPasswordExpiration:null,_verificationToken:null}
  return data
}
