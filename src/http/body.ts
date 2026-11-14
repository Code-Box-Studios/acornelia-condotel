export async function readBoundedJson(request:Request,limit=16384):Promise<unknown>{
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('JSON request required')
  const reader=request.body?.getReader()
  if(!reader)throw new Error('Request body required')
  let size=0
  const chunks:Uint8Array[]=[]
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new Error('Request body too large')}chunks.push(part.value)}}finally{reader.releaseLock()}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body))
}
