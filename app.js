import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadFactoryModel,loadMetrics} from './model-loader.js';
import {setupStudioLighting} from './studio-lighting.js';
import lesson from './lesson.json';
const $=id=>document.getElementById(id), stage=$('viewer');
const state={loaded:false,loading:false,mode:'factory',topic:'overview',explosion:0,labels:true,isolate:true,view:'overview',phase:'idle',progress:0,heat:0,pole:0,delay:5,elapsed:0,closed:false,fused:Array(lesson.poles).fill(false),carriers:Array(lesson.poles).fill(true)};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,5000);
if(lesson.id==='jsz3')camera.up.set(0,-1,0);
let renderer,controls,model,factory,teaching,studioEnvironment,last=0,dirty=true,animation=null,highlight=null;
const factoryParts=new Map(),teachGroups=new Map(),rest=new Map(),hotspots=new Map();
const directions={overview:[1,.40,1.8],front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0]};
const names={overview:'整体观察',front:'正面',back:'背面',left:'左侧',right:'右侧',focus:'部件放大',free:'自由观察'};
const operationDefaults={button:'按钮释放：示例 NO 断开，NC 闭合。',limit:'执行头释放：示例 NO 断开，NC 闭合。',thermal:'正常状态：控制用常闭触头闭合，脱扣反馈触头断开。',timer:'未通电：计时归零，延时输出处于初始状态。',breaker:'分闸状态：各极主触头断开。',fuse:'熔断体完整且载熔件装入时，该极导通。',terminal:'同一路的两个接线端通过导电片连接；相邻路互相绝缘。'};
function text(id,value){$(id).textContent=value;}
function viewGroups(){return state.mode==='teaching'?lesson.topics:lesson.factoryGroups;}
function objectFor(id){return state.mode==='teaching'?teachGroups.get(id):factoryParts.get(id);}
function boxFor(id){
 const box=new THREE.Box3();
 if(id){const def=viewGroups().find(g=>g.id===id);if(state.mode==='teaching'){const o=teachGroups.get(id);if(o)box.setFromObject(o);}else for(const n of def?.members||[]){const o=factoryParts.get(n);if(o)box.expandByObject(o);}}
 else box.setFromObject(state.mode==='teaching'?teaching:factory);
 return box;
}
function fit(view='overview',box=null){
 if(!controls||!state.loaded)return;
 const b=box||boxFor(state.isolate&&state.topic!=='overview'?state.topic:null);if(b.isEmpty())return;
 const dir=new THREE.Vector3(...(directions[view]||directions.overview)).normalize();
 const center=b.getCenter(new THREE.Vector3()),right=new THREE.Vector3().crossVectors(camera.up,dir).normalize(),up=new THREE.Vector3().crossVectors(dir,right).normalize();
 let x=0,y=0,z=0;for(const a of [b.min.x,b.max.x])for(const c of [b.min.y,b.max.y])for(const d of [b.min.z,b.max.z]){const p=new THREE.Vector3(a,c,d).sub(center);x=Math.max(x,Math.abs(p.dot(right)));y=Math.max(y,Math.abs(p.dot(up)));z=Math.max(z,Math.abs(p.dot(dir)));}
 const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));const distance=(Math.max(y/tangent,x/(tangent*camera.aspect))+z)*1.38;
 camera.position.copy(center).addScaledVector(dir,Math.max(45,distance));controls.target.copy(center);controls.update();state.view=view;text('view-name',names[view]||names.overview);dirty=true;
}
function resetOperation(){animation=null;state.phase='idle';state.progress=0;state.heat=0;state.elapsed=0;state.closed=lesson.kind==='terminal';state.fused.fill(false);state.carriers.fill(true);text('operation-status',operationDefaults[lesson.kind]);applyPose();}
function setMode(mode){
 if(!state.loaded)return;
 resetOperation();
 if(mode==='assembly'&&!lesson.factoryDisassembly){mode='teaching';state.explosion=1;}else state.explosion=mode==='assembly'?1:0;
 state.mode=mode;state.topic='overview';factory.visible=mode!=='teaching';teaching.visible=mode==='teaching';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 text('source-badge',mode==='teaching'?'三维教学结构 · 明确标注':'原厂 CAD 几何');$('source-badge').classList.toggle('teaching',mode==='teaching');
 text('model-note',mode==='teaching'?'内部机构按功能关系补建；形状、尺寸、配色和动作属于教学示意。':mode==='assembly'?'原厂可分部件按装配层分组展开，螺丝随所属组件移动；间距为教学设置。':'原厂 STEP 外观完整保留，配色用于辅助观察。切换教学结构可拆开看工作过程。');
 buildTopics();applyPose();showTopic('overview',false);fit();
}
function applyPose(){
 if(!model)return;
 for(const [o,r]of rest){o.position.copy(r.position);o.quaternion.copy(r.quaternion);o.scale.copy(r.scale);o.visible=true;}
 for(const def of lesson.factoryGroups)for(const n of def.members){const o=factoryParts.get(n);if(!o)continue;const r=rest.get(o);const world=new THREE.Vector3(...(def.memberOffsets?.[n]||def.offset)).multiplyScalar(state.mode==='assembly'?state.explosion:0);const inv=o.parent.matrixWorld.clone().invert();const local=world.clone().applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));o.position.copy(r.position).add(local);}
 for(const def of lesson.topics){const o=teachGroups.get(def.id);if(o)o.position.z+=def.explodeOffset[2]*state.explosion/1000;}
 const g=id=>teachGroups.get(id),move=(id,x,y,z)=>{const o=g(id);if(o)o.position.add(new THREE.Vector3(x,y,z).multiplyScalar(.001));},rotate=(id,z)=>{const o=g(id);if(o)o.rotateZ(THREE.MathUtils.degToRad(z));};
 if(lesson.kind==='button'){move('cap',0,0,-3*state.progress);move('plunger',0,0,-3*state.progress);if(g('spring'))g('spring').scale.z=1-.15*state.progress;}
 if(lesson.kind==='limit'){move('actuator',0,-4*state.progress,0);move('drive',0,-3*state.progress,0);if(g('spring'))g('spring').scale.y=1-.15*state.progress;}
 if(lesson.kind==='thermal'){rotate('bimetal',-8*state.heat);move('trip',0,-3*state.progress,0);}
 if(lesson.kind==='timer'){move('coil',0,0,-state.progress);}
 if(lesson.kind==='breaker'){rotate('handle',-18*state.progress);rotate('thermal',-6*state.heat);if(state.phase==='short')move('magnetic',0,-3,0);}
 if(['button','limit','thermal','timer','breaker'].includes(lesson.kind))g('contacts')?.traverse(o=>{
  if(o.userData.motion_role==='bridge'){const progress=lesson.kind==='timer'&&o.userData.contact_mode==='instant'?(['timing','elapsed'].includes(state.phase)?1:0):state.progress;o.position.z+=(o.userData.contact_type==='NC'?1:-1)*.0025*progress;}
 });
 if(lesson.kind==='fuse')for(const id of ['carrier','fuselink','filament'])g(id)?.traverse(o=>{if(o.isMesh&&o.userData.pole!==undefined){const r=rest.get(o);o.position.z+=state.carriers[o.userData.pole]?0:.025;if(id==='filament')o.visible=!state.fused[o.userData.pole];}});
 for(const [id,o]of teachGroups){o.traverse(mesh=>{if(!mesh.isMesh)return;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){m.emissive?.setHex(0);if(id==='heaters'&&state.heat>0)m.emissive?.setRGB(.35*state.heat,.035*state.heat,0);if(id==='timing'&&state.phase==='timing')m.emissive?.setHex(0x143126);if(id==='conductors'&&state.phase==='connected'&&mesh.userData.pole===state.pole)m.emissive?.setHex(0x694319);}});}
 const selected=viewGroups().find(g=>g.id===state.topic);
 if(state.isolate&&selected){if(state.mode==='teaching'){for(const [id,o]of teachGroups)o.visible=id===selected.id;}else for(const [id,o]of factoryParts)o.visible=selected.members.includes(id);}
 factory.visible=state.mode!=='teaching';teaching.visible=state.mode==='teaching';
 model.updateMatrixWorld(true);$('explosion-range').value=String(Math.round(state.explosion*100));text('explosion-value',Math.round(state.explosion*100)+'%');text('explode-button',state.explosion>0?'合拢模型':'拆开观察');dirty=true;
 if(highlight&&state.topic!=='overview')highlight.box.copy(boxFor(state.topic)).expandByScalar(.65);
 updateCircuit();
}
function updateCircuit(){
 const pairs=['button','limit','thermal','timer'].includes(lesson.kind);
 const lines=lesson.kind==='timer'?[['瞬动 1–3',['timing','elapsed'].includes(state.phase)],['瞬动 1–4',!['timing','elapsed'].includes(state.phase)],['延时 8–6',state.progress>.98],['延时 8–5',state.progress<.02]]:pairs?[['NO',state.progress>.98],['NC',state.progress<.02]]:lesson.kind==='breaker'?Array.from({length:lesson.poles},(_,i)=>['第 '+(i+1)+' 极',state.progress>.98]):lesson.kind==='fuse'?[['第 '+(state.pole+1)+' 极',state.carriers[state.pole]&&!state.fused[state.pole]]]:[['第 '+(state.pole+1)+' 路',true]];
 let svg='';const width=420/lines.length;
 lines.forEach(([name,closed],i)=>{const x=i*width+width/2,color=closed?'#38936e':'#8196a8';
  svg+=`<text x="${x}" y="18" text-anchor="middle" fill="#526f88">${name}</text><path d="M ${x-45} 45 H ${x-9} M ${x+9} 45 H ${x+45}" fill="none" stroke="${color}" stroke-width="2.4"/><circle cx="${x-9}" cy="45" r="2.8" fill="white" stroke="${color}"/><circle cx="${x+9}" cy="45" r="2.8" fill="white" stroke="${color}"/><path d="M ${x-9} 45 L ${x+9} ${closed?45:31}" stroke="${color}" stroke-width="2.4"/><text x="${x}" y="73" text-anchor="middle" fill="${color}">${closed?'接通':'断开'}</text>`;
 });$('circuit-state').innerHTML=svg;
}
function buildTopics(){
 $('topic-list').replaceChildren();$('hotspots').replaceChildren();$('callout-lines').replaceChildren();hotspots.clear();
 viewGroups().forEach((def,index)=>{
  const b=document.createElement('button');b.type='button';b.className='topic-button';b.dataset.topic=def.id;b.innerHTML='<span>'+String(index+1).padStart(2,'0')+'</span><span><strong></strong><small></small></span>';b.querySelector('strong').textContent=def.title;b.querySelector('small').textContent=state.mode==='teaching'?'教学结构':'原厂几何';b.onclick=()=>showTopic(def.id);$('topic-list').append(b);
  const h=document.createElement('button');h.type='button';h.className='hotspot';h.innerHTML='<span class="number">'+String(index+1).padStart(2,'0')+'</span><span><strong></strong><small></small></span>';h.querySelector('strong').textContent=def.title;h.querySelector('small').textContent=state.mode==='teaching'?'功能关系示意':'原厂部件';h.onclick=()=>showTopic(def.id);h.setAttribute('aria-label','查看'+def.title);$('hotspots').append(h);
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('fill','none');line.setAttribute('stroke','#a4b9ca');line.setAttribute('stroke-width','1');const dot=document.createElementNS(line.namespaceURI,'circle');dot.setAttribute('r','3');dot.setAttribute('fill','#fff');dot.setAttribute('stroke','#91b0ca');$('callout-lines').append(line,dot);hotspots.set(def.id,{h,line,dot,index});
 });
}
function showTopic(id,move=true){
 state.topic=id;const def=viewGroups().find(g=>g.id===id);
 text('lesson-tag',state.mode==='teaching'?'三维教学结构 · '+lesson.model:'原厂 CAD · '+lesson.model);
 text('lesson-title',def?.title||(state.mode==='teaching'?'拆开看它怎样工作':'先认识这件元器件'));
 text('lesson-subtitle',def?.description||lesson.subtitle);
 text('lesson-summary',def?.summary||lesson.summary);text('lesson-behavior',def?.behavior||lesson.behavior);
 text('lesson-note',state.mode==='teaching'?(def?.note||lesson.teachingNote):'几何来自提供的原厂 STEP。点击部位可放大；内部工作关系请切换三维教学结构。');
 $('focus-options').hidden=!def;document.querySelectorAll('[data-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topic===id)));
 if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}
 applyPose();if(def){highlight=new THREE.Box3Helper(boxFor(id).expandByScalar(.65),0x3c90cf);highlight.material.depthTest=false;highlight.renderOrder=5;scene.add(highlight);}if(move)fit(def?'focus':'overview');dirty=true;
}
function updateLabels(){
 const width=stage.clientWidth,height=stage.clientHeight;$('callout-lines').setAttribute('viewBox',`0 0 ${width} ${height}`);
 for(const [id,a]of hotspots){const box=boxFor(id);const p=box.isEmpty()?null:box.getCenter(new THREE.Vector3()).project(camera);const visible=state.labels&&p&&p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1&&(state.topic==='overview'||!state.isolate||state.topic===id);
  a.h.hidden=!visible;a.line.style.display=a.dot.style.display=visible?'':'none';if(!visible)continue;
  const left=a.index%2===0,row=Math.floor(a.index/2),rows=Math.ceil(hotspots.size/2),y=height*(.23+row*(.54/Math.max(1,rows-1)));const x=left?10:width-a.h.offsetWidth-10;a.h.style.left=x+'px';a.h.style.top=y+'px';a.h.classList.toggle('active',state.topic===id);
  const px=(p.x+1)*width/2,py=(1-p.y)*height/2,sx=left?x+a.h.offsetWidth:x;a.line.setAttribute('points',`${sx},${y} ${sx+(left?10:-10)},${y} ${px},${py}`);a.dot.setAttribute('cx',px);a.dot.setAttribute('cy',py);
 }
 if(highlight)highlight.visible=state.labels;
}
function enterAction(){
 if(state.mode!=='teaching')setMode('teaching');
 state.topic='overview';state.explosion=0;if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}showTopic('overview',false);applyPose();fit();
}
function tween(target,phase,duration=.7){animation={from:state.progress,to:target,elapsed:0,duration,phase};state.phase=phase;}
function action(command){
 enterAction();
 const kind=lesson.kind;
 if(kind==='button'||kind==='limit'){state.closed=command==='press';tween(state.closed?1:0,state.closed?'pressed':'released');text('operation-status',state.closed?'已施加外力：示例 NO 接通，NC 断开。':'外力撤去：示例 NO 断开，NC 闭合。');}
 if(kind==='thermal'){if(command==='overload'){state.heat=0;tween(1,'heating',2);text('operation-status','过载教学演示：加热元件发热，双金属片弯曲，推动脱扣机构。');}else{state.heat=1;tween(0,'cooling',2);text('operation-status','冷却与复位：热效应减弱，控制触头恢复。');}}
 if(kind==='timer'){if(command==='power'){state.elapsed=0;state.progress=0;state.phase='timing';animation=null;text('operation-status','电源 2–7 通电：瞬动触头立即切换，延时触头开始计时。');}else resetOperation();}
 if(kind==='breaker'){
  if(command==='on'&&['tripped','heating','short'].includes(state.phase)){text('operation-status','当前已脱扣，请先复位到分闸位置，再合闸。');return;}
  if(command==='on'){state.closed=true;state.heat=0;tween(1,'on');text('operation-status','合闸：联动手柄带动各极主触头闭合。');}
  if(command==='off'||command==='reset'){state.closed=false;state.heat=0;tween(0,'off');text('operation-status','分闸 / 复位：各极主触头断开，可重新合闸。');}
  if(command==='overload'){state.closed=true;state.heat=0;state.progress=1;tween(0,'heating',2);text('operation-status','过载教学演示：热脱扣元件受热变形，随后各极联动分断。');}
  if(command==='short'){state.closed=false;state.heat=0;tween(0,'short',.4);text('operation-status','短路教学演示：电磁脱扣机构动作，各极主触头分断。');}
 }
 if(kind==='fuse'){if(command==='remove')state.carriers[state.pole]=false;if(command==='insert')state.carriers[state.pole]=true;if(command==='fuse')state.fused[state.pole]=true;if(command==='replace')state.fused[state.pole]=false;state.phase=command;const closed=state.carriers[state.pole]&&!state.fused[state.pole];state.closed=closed;text('operation-status',`第 ${state.pole+1} 极：${state.fused[state.pole]?'熔体已熔断': '熔断体完整'} · ${state.carriers[state.pole]?'载熔件已装入':'载熔件已取出'} · ${closed?'回路导通':'回路开路'}。`);}
 if(kind==='terminal'){state.phase=command==='connect'?'connected':'idle';text('operation-status',command==='connect'?`第 ${state.pole+1} 路导电片已高亮：该路两端连通，相邻路保持绝缘。`:operationDefaults.terminal);}
 applyPose();
}
function setupUI(){
 text('title',lesson.title);text('product-model',lesson.model);text('intro',lesson.subtitle);text('source-description','模型来源：'+lesson.sourceFilename+'。原厂外观保留；补建内部结构均标为三维教学示意。');
 $('official-link').href=$('lesson-source').href=lesson.sourceUrl;$('repo-link').href='https://github.com/titleone01/'+lesson.repo;document.title=lesson.model+' · '+lesson.title+'三维互动教材';
 for(const [cmd,label]of lesson.actions){const b=document.createElement('button');b.type='button';b.dataset.action=cmd;b.textContent=label;b.onclick=()=>action(cmd);$('action-buttons').append(b);}
 for(const [index,step]of lesson.steps.entries()){const d=document.createElement('div');d.className='step';const n=document.createElement('span');n.textContent=String(index+1).padStart(2,'0');const b=document.createElement('b');b.textContent=step;d.append(n,b);$('principle-steps').append(d);}
 if(['fuse','terminal'].includes(lesson.kind)){$('pole-control').hidden=false;for(let i=0;i<lesson.poles;i++){$('pole-select').add(new Option('第 '+(i+1)+' '+(lesson.kind==='fuse'?'极':'路'),String(i)));}$('pole-select').onchange=e=>{state.pole=Number(e.target.value);if(lesson.kind==='terminal'&&state.phase==='connected')action('connect');else if(lesson.kind==='fuse')action('inspect');};}
 if(lesson.kind==='timer'){$('timer-control').hidden=false;$('delay-seconds').onchange=e=>{state.delay=Math.max(1,Math.min(10,Number(e.target.value)||5));e.target.value=String(state.delay);resetOperation();};}
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(b.dataset.view));
 $('explode-button').onclick=()=>{const target=state.explosion>0?0:1;if(state.mode==='factory')setMode(lesson.factoryDisassembly?'assembly':'teaching');resetOperation();state.explosion=target;applyPose();fit();};
 $('explosion-range').oninput=e=>{const v=Number(e.target.value)/100;if(state.mode==='factory')setMode(lesson.factoryDisassembly?'assembly':'teaching');resetOperation();state.explosion=v;state.topic='overview';showTopic('overview',false);applyPose();fit();};
 $('reset-view').onclick=()=>{state.labels=true;$('toggle-labels').checked=true;state.isolate=true;$('isolate-part').checked=true;setMode('factory');};
 $('overview-button').onclick=()=>showTopic('overview');$('toggle-labels').onchange=e=>{state.labels=e.target.checked;dirty=true;};$('isolate-part').onchange=e=>{state.isolate=e.target.checked;applyPose();fit('focus');};$('retry-model').onclick=load;
}
async function load(){
 if(state.loading)return;state.loading=true;$('viewer-error').hidden=true;$('loading').hidden=false;
 document.querySelectorAll('main button, main input,main select').forEach(b=>b.disabled=true);
 try{
  if(!renderer){renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.domElement.setAttribute('aria-label',lesson.title+'三维模型，拖动旋转，滚轮或双指缩放');stage.prepend(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=30;controls.maxDistance=1800;controls.addEventListener('change',()=>dirty=true);controls.addEventListener('start',()=>{state.view='free';text('view-name',names.free);});studioEnvironment=setupStudioLighting(renderer,scene);new ResizeObserver(resize).observe(stage);resize();requestAnimationFrame(frame);}
  const gltf=await loadFactoryModel(s=>text('loading-text',s));if(model)scene.remove(model);model=gltf.scene;model.scale.setScalar(1000);scene.add(model);model.updateMatrixWorld(true);factory=model.getObjectByName('factory');teaching=model.getObjectByName('teaching');if(!factory||!teaching)throw Error('模型缺少原厂或教学结构节点');
  rest.clear();factoryParts.clear();teachGroups.clear();for(const def of lesson.parts){const o=model.getObjectByName(def.id);if(!o)throw Error('原厂部件缺失：'+def.id);factoryParts.set(def.id,o);}
  for(const def of lesson.topics){const o=model.getObjectByName('teach_'+def.id);if(!o)throw Error('教学部件缺失：'+def.id);teachGroups.set(def.id,o);}
  model.traverse(o=>{rest.set(o,{position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone(),parent:o.parent});if(o.isMesh){const array=Array.isArray(o.material);const materials=(array?o.material:[o.material]).map(m=>{const copy=m.clone();if(o.userData.geometry_origin==='teaching'&&['housing','cover'].includes(o.userData.lesson_id)){copy.transparent=true;copy.opacity=.16;copy.depthWrite=false;}return copy;});o.material=array?materials:materials[0];}});
  state.actualFactoryTriangles=0;factory.traverse(o=>{if(o.isMesh)state.actualFactoryTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
  state.loaded=true;state.loading=false;text('model-status','原厂模型 · 已载入');$('loading').hidden=true;document.querySelectorAll('main button,main input,main select').forEach(b=>b.disabled=false);setMode('factory');
 }catch(e){console.error(e);state.loading=false;state.loaded=false;$('loading').hidden=true;$('viewer-error').hidden=false;text('error-text',e.message+(location.protocol==='file:'?'。请确认文件完整，并使用支持 WebGL 的 Chrome 或 Edge。':'。请检查连接后重试。'));text('model-status','模型载入未完成');$('retry-model').disabled=false;}
}
function resize(){if(!renderer)return;camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight,false);if(state.loaded)fit(state.view==='free'?'overview':state.view);dirty=true;}
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min(.1,(now-last)/1000||.016);last=now;if(document.hidden)return;
 if(animation){animation.elapsed+=dt;const t=Math.min(1,animation.elapsed/animation.duration),s=t*t*(3-2*t);state.progress=THREE.MathUtils.lerp(animation.from,animation.to,s);if(animation.phase==='heating')state.heat=t;if(animation.phase==='cooling')state.heat=1-t;
  if(t===1){if(animation.phase==='heating'||animation.phase==='short'){state.phase='tripped';state.closed=false;text('operation-status',lesson.kind==='thermal'?'已脱扣：控制用常闭触头断开，脱扣反馈触头闭合。':'已脱扣：各极主触头断开；复位后可重新合闸。');}else if(animation.phase==='cooling'){state.phase='idle';text('operation-status',operationDefaults.thermal);}animation=null;}applyPose();
 }
 if(state.phase==='timing'){state.elapsed=Math.min(state.delay,state.elapsed+dt);text('operation-status',`通电计时：${state.elapsed.toFixed(1)} / ${state.delay} 秒 · 瞬动 1–3 已接通，延时 8–6 尚未接通。`);if(state.elapsed>=state.delay){state.phase='elapsed';state.closed=true;tween(1,'elapsed');text('operation-status','计时到达：延时 8–6 接通、8–5 断开；断电后瞬动和延时触头均复位。');}dirty=true;}
 controls?.update();if(dirty&&state.loaded){camera.updateMatrixWorld(true);updateLabels();renderer.render(scene,camera);dirty=false;}
}
function materialDiagnostics(){
 const records=[];
 model?.traverse(o=>{
  if(!o.isMesh)return;
  let partId=null,origin=null;
  for(let p=o;p;p=p.parent){if(!partId&&p.userData.part_id)partId=p.userData.part_id;if(!origin&&p.userData.geometry_origin)origin=p.userData.geometry_origin;}
  for(const material of Array.isArray(o.material)?o.material:[o.material])records.push({mesh:o.name,partId,origin,name:material.name,color:material.color.toArray(),metalness:material.metalness,roughness:material.roughness,opacity:material.opacity,transparent:material.transparent,transmission:material.transmission||0,ior:material.ior??1.5,clearcoat:material.clearcoat||0,clearcoatRoughness:material.clearcoatRoughness||0});
 });
 return records;
}
window.__COMPONENT__={materials:materialDiagnostics,snapshot:()=>({...state,factoryTriangles:lesson.factoryTriangles,factoryParts:factoryParts.size,teachingGroups:teachGroups.size,load:{...loadMetrics},camera:camera.position.toArray(),target:controls?.target.toArray(),studio:{environmentReady:!!studioEnvironment,environmentIntensity:scene.environmentIntensity,exposure:renderer?.toneMappingExposure,environmentResolution:128},visibleHotspots:[...hotspots].filter(([,a])=>!a.h.hidden).map(([id])=>id),parentsPreserved:[...rest].every(([o,r])=>o.parent===r.parent),maximumRestErrorMM:Math.max(0,...[...rest].filter(([o])=>factoryParts.has(o.name)).map(([o,r])=>o.position.distanceTo(r.position)*1000)),teachingPositions:Object.fromEntries([...teachGroups].map(([id,o])=>[id,o.position.toArray()])),renderedFrames:renderer?.info.render.frame})};
setupUI();text('operation-status',operationDefaults[lesson.kind]);load();
