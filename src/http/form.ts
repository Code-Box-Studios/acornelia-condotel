export async function readBoundedForm(request:Request,limit=1024):Promise<URLSearchParams>{
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new Error('Form request required')
  const reader=request.body?.getReader();if(!reader)throw new Error('Request body required')
  let size=0;const chunks:Uint8Array[]=[]
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit){await reader.cancel();throw new Error('Request is too large')};chunks.push(next.value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  return new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
}
