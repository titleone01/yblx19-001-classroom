import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.mjs';
import modelAsset from './assets/model.json';
import lesson from './lesson.json';
export const loadMetrics={source:'',bytes:0,attempts:0,started:0,decodedAt:0};
const isGLB=a=>a[0]===103&&a[1]===108&&a[2]===84&&a[3]===70;
export async function loadFactoryModel(onProgress){
 loadMetrics.started=performance.now();loadMetrics.attempts=0;loadMetrics.bytes=0;
 const gzip=typeof DecompressionStream!=='undefined';const url=new URL('./assets/'+(gzip?modelAsset.compressed:modelAsset.fallback),import.meta.url).href;
 let cache;try{cache=await caches.open(lesson.id+'-'+modelAsset.sha256.slice(0,12));}catch{}
 const parse=async bytes=>{
  onProgress('解析原厂模型…');
  let buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  if(!isGLB(bytes))buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(buffer.byteLength!==modelAsset.decodedBytes||!isGLB(new Uint8Array(buffer)))throw Error('模型数据校验未通过');
  await MeshoptDecoder.ready;const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,new URL('./assets/',import.meta.url).href);loadMetrics.decodedAt=performance.now();return g;
 };
 try{const saved=await cache?.match(url);if(saved){loadMetrics.source='model-cache';return await parse(new Uint8Array(await saved.arrayBuffer()));}}catch{try{await cache?.delete(url);}catch{}}
 loadMetrics.source='network';
 for(let attempt=0;attempt<2;attempt++){
  const abort=new AbortController();let timer;const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>abort.abort(),45000);};touch();
  try{
   loadMetrics.attempts++;onProgress(attempt?'连接中断，正在重试…':'下载模型…');
   const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw Error('下载失败（'+response.status+'）');
   const chunks=[];let loaded=0,total=gzip?modelAsset.compressedBytes:modelAsset.decodedBytes;
   if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;touch();if(!loaded&&isGLB(value))total=modelAsset.decodedBytes;loaded+=value.length;if(loaded>modelAsset.decodedBytes)throw Error('模型文件长度异常');chunks.push(value);onProgress('下载 '+(loaded/1e6).toFixed(2)+' / '+(total/1e6).toFixed(2)+' MB · '+Math.min(100,Math.floor(loaded/total*100))+'%');}}
   else{const a=new Uint8Array(await response.arrayBuffer());chunks.push(a);loaded=a.length;}
   const bytes=new Uint8Array(loaded);let offset=0;for(const a of chunks){bytes.set(a,offset);offset+=a.length;}
   if(loaded!==(isGLB(bytes)?modelAsset.decodedBytes:modelAsset.compressedBytes))throw Error('模型文件不完整');loadMetrics.bytes=loaded;
   const result=await parse(bytes);try{await cache?.put(url,new Response(bytes));}catch{}return result;
  }catch(e){if(attempt)throw Error(e.name==='AbortError'?'45 秒没有收到数据，请重试':e.message);}finally{clearTimeout(timer);}
 }
}
