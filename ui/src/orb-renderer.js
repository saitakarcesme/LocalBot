/** Living Marble: projected, depth-sorted ribbon surfaces; no textures or dependencies.
 * Palette tokens are deliberately independent from application light/dark themes.
 */
export const ORB_PALETTES = {
 marble: {name:'Marble', base:['#112856','#4067be'], ribbons:[['#2563eb','#22d3ee'],['#f97316','#facc15'],['#8b5cf6','#fb7185']]},
 lagoon: {name:'Lagoon', base:['#123b51','#328b9d'], ribbons:[['#146e98','#68e4da'],['#10b981','#b2efd9'],['#385cb5','#7eb5ee']]},
 dusk: {name:'Dusk', base:['#30275b','#71669a'], ribbons:[['#7956c9','#d8b9ed'],['#db698b','#ffc0a2'],['#4658b1','#a7bbf8']]},
};
export const ORB_STATES = ['idle','thinking','generating','listening','success','error'];
const mix = (a,b,t) => a.map((x,i)=>Math.round(x+(b[i]-x)*t));
const rgb = hex => hex.slice(1).match(/../g).map(x=>parseInt(x,16));
const css = c => `rgb(${c.join(',')})`;
const clamp = (v,min=0,max=1) => Math.max(min,Math.min(max,Number(v)||0));
const profiles = {idle:[.13,.08],thinking:[.55,.38],generating:[.32,.30],listening:[.12,.12],success:[.21,.10],error:[.07,.14]};

/** One deterministic frame, also used for icon export and the reduced-motion pose. */
function drawOrbFallback(ctx, size, {time=0, concept='flow', palette='marble', theme='dark', activity=.08, pulse=0, amplitude=0, error=0}={}) {
 const p = typeof palette === 'object' ? palette : ORB_PALETTES[palette] || ORB_PALETTES.marble;
 const radius=size*.475*(1+Math.min(.035,pulse*.025+amplitude*.02));
 ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(size/2,size/2);
 ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.clip();
 const base=ctx.createLinearGradient(-radius,-radius,radius,radius);
 base.addColorStop(0,p.base[1]);base.addColorStop(1,p.base[0]);ctx.fillStyle=base;ctx.fillRect(-radius,-radius,size,size);
 const mesh=[], steps=size<50?32:96, count=concept==='marble'?4:3;
 const tilt=-.48+.10*Math.sin(time*.37), ct=Math.cos(tilt),st=Math.sin(tilt);
 const transform=(lat,angle,r) => {
  const x=Math.cos(lat)*Math.sin(angle)*r,y=Math.sin(lat)*r,z=Math.cos(lat)*Math.cos(angle)*r;
  // A second axis of rotation makes front/back exchange legible without a flat spin.
  const pitch=.24*Math.sin(time*.23+.7), yy=y*Math.cos(pitch)-z*Math.sin(pitch),zz=y*Math.sin(pitch)+z*Math.cos(pitch);
  return {x:(x*ct-yy*st)*radius,y:(x*st+yy*ct)*radius,z:zz};
 };
 for(let band=0;band<count;band++) {
  const colors=p.ribbons[band%3].map(rgb);
  const point=(i,side)=>{
   const lat=-Math.PI/2+i/steps*Math.PI;
   const wave=Math.sin(lat*2.2+time*(.65+band*.07)+band)*(.36+activity*.3);
   const twist=concept==='flow'?.60:concept==='core'?.85:1.35;
   const center=band*Math.PI*2/count+time+lat*twist+wave;
   const width=(concept==='core'?1.20:concept==='flow'?.78:.46)*(1+.12*Math.sin(lat*3-time*.8+band));
   return transform(lat,center+side*width, .995-.015*band);
  };
  for(let i=0;i<steps;i++) {
   const a=point(i,-1),b=point(i,1),c=point(Math.min(steps,i+1.12),1),d=point(Math.min(steps,i+1.12),-1);
   mesh.push({v:[a,b,c,d],z:(a.z+b.z+c.z+d.z)/4,colors,i,band});
  }
 }
 mesh.sort((a,b)=>a.z-b.z);
 for(const face of mesh) {
  const {v,z,colors,i,band}=face;
  const shade=z=>{
   const light=clamp((z+1)/2);
   let col=mix(colors[0],colors[1],.15+light*.80);
   col=mix(rgb(p.base[0]),col,.72+light*.28);
   return css(mix(col,[151,129,151],clamp(error*.55)));
  };
  const gradient=ctx.createLinearGradient(v[0].x,v[0].y,v[1].x+.001,v[1].y);
  gradient.addColorStop(0,shade((v[0].z+v[3].z)/2));
  gradient.addColorStop(1,shade((v[1].z+v[2].z)/2));
  ctx.globalAlpha=1;
  ctx.beginPath();v.forEach((q,j)=>j?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();
  ctx.fillStyle=gradient;ctx.fill();
 }
 ctx.globalAlpha=1;
 // Broad diffuse illumination only: no specular spots, rim glow or glass reflections.
 const wash=ctx.createRadialGradient(-radius*.35,-radius*.45,0,0,0,radius*1.35);
 wash.addColorStop(0,`rgba(237,248,255,${concept==='core'?.34:.12})`);wash.addColorStop(.65,'rgba(220,232,255,0)');wash.addColorStop(1,'rgba(8,18,45,.13)');
 ctx.fillStyle=wash;ctx.fillRect(-radius,-radius,size,size);ctx.restore();
}


// One shared GPU context, regardless of the number of avatars. Analytic front/back
// sphere intersections eliminate mesh seams; inverse 3D rotation gives occlusion.
let gpu, gpuUnavailable=false;
function graphics() {
 if(gpu||gpuUnavailable)return gpu;
 try {
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false});
  if(!gl)throw Error('WebGL unavailable');
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`
precision highp float;
uniform float size,time,concept,activity,pulse,amplitude,error,lightTheme;
uniform vec3 base0,base1,c0,c1,c2,c3,c4,c5;
const float PI=3.14159265359;
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
vec4 ribbons(vec3 n,float front){
 vec3 p=n;p.xy=rot(-.48+.10*sin(time*.37))*p.xy;p.yz=rot(.24*sin(time*.23+.7))*p.yz;p.xz=rot(time+.55)*p.xz;
 float count=concept<.5?4.:3.;
 float twist=concept<.5?1.35:concept<1.5?.85:.60;
 float phi=atan(p.x,p.z)+p.y*twist+sin(p.y*2.2+time*.65)*(.36+activity*.30);
 float pos=(phi+PI)*count/(2.*PI);float band=floor(pos);float f=fract(pos);
 float width=concept<.5?.22:concept<1.5?.46:.34;
 float soft=concept>.5&&concept<1.5?.18:.10;
 float mask=1.-smoothstep(width-soft,width+soft,abs(f-.5));
 float index=mod(band,3.);vec3 a=c0,b=c1;if(index>.5){a=c2;b=c3;}if(index>1.5){a=c4;b=c5;}
 float blend=clamp(.5+.35*p.y+.20*n.z,0.,1.);
 vec3 color=mix(a,b,blend);
 color=mix(base0,color,mix(.58,1.,front));
 color=mix(color,vec3(.59,.51,.59),error*.45);
 // Narrow caustic edge surrounded by a translucent, dispersed beam.
 float edge=exp(-pow((abs(f-.5)-width*.72)*35.,2.));
 float core=exp(-pow((f-.5)*6.,2.));
 color=mix(color,vec3(.94,.98,1.),edge*.48);
 color*=.70+core*.36+edge*.32;
 return vec4(color,mask*(.32+core*.40));
}
void main(){
 vec2 q=(gl_FragCoord.xy/size*2.-1.);q.y=-q.y;
 float scale=.95*(1.+min(.035,pulse*.025+amplitude*.02));q/=scale;
 q.x+=sin(q.y*5.+time*2.)*.018*error*(1.-min(1.,dot(q,q)));
 float r2=dot(q,q);float alpha=1.-smoothstep(1.-2./size,1.,r2);if(alpha<=0.){gl_FragColor=vec4(0.);return;}
 float z=sqrt(max(0.,1.-r2));
 vec3 color=mix(base1,base0,clamp(.5+.25*q.y+.15*q.x,0.,1.));
 // Refracted view ray bends toward the normal inside the dielectric volume.
 vec3 normal=vec3(q,z);
 vec3 ray=refract(vec3(0.,0.,-1.),normal,1./1.46);
 vec3 farPoint=normalize(normal+ray*(1.65*z));
 vec4 back=ribbons(farPoint,0.);color=mix(color*.58,back.rgb,back.a);
 vec4 middle=ribbons(normalize(mix(normal,farPoint,.48)+vec3(.04,-.06,.02)),.55);
 color=mix(color,middle.rgb,middle.a*.72);
 vec4 front=ribbons(vec3(q,z),1.);color=mix(color,front.rgb,front.a);
 float fresnel=pow(1.-z,3.);
 vec3 halfLight=normalize(vec3(-.42,-.62,1.8));
 float highlight=pow(max(0.,dot(normal,halfLight)),65.);
 float caustic=exp(-pow(length(q-vec2(.16,.22))-.67,2.)*1300.)*max(0.,q.y)*.26;
 color+=vec3(.78,.89,1.)*(highlight*.55+fresnel*.12+caustic);
 color=vec3(1.)-exp(-color*1.24);
 float wash=max(0.,1.-length(q-vec2(-.3,-.4))*.65);
 color=mix(color,vec3(.88,.95,1.),wash*(concept>.5&&concept<1.5?.22:.06)+lightTheme*.02);
 gl_FragColor=vec4(color,alpha);
}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Orb shader link failed');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  const locations={};for(const key of ['size','time','concept','activity','pulse','amplitude','error','lightTheme','base0','base1','c0','c1','c2','c3','c4','c5'])locations[key]=gl.getUniformLocation(program,key);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();gpu=null;gpuUnavailable=true;});
  canvas.addEventListener('webglcontextrestored',()=>{gpu=null;gpuUnavailable=false;});
  gpu={canvas,gl,locations};return gpu;
 }catch{gpuUnavailable=true;return null;}
}
export function drawOrb(ctx,size,options={}){
 const g=graphics();if(!g){drawOrbFallback(ctx,size,{...options,time:.55});return;}
 const {canvas,gl,locations}=g;
 const pixels=Math.min(1024,Math.max(1,Math.round(size*(ctx.getTransform().a||1))));
 if(canvas.width!==1024){canvas.width=canvas.height=1024;}
 gl.viewport(0,0,pixels,pixels);
 const palette=typeof options.palette==='object'?options.palette:ORB_PALETTES[options.palette]||ORB_PALETTES.marble;
 const values={size:pixels,time:options.time??.55,concept:{marble:0,core:1,flow:2}[options.concept]??2,activity:options.activity??.08,pulse:options.pulse||0,amplitude:options.amplitude||0,error:options.error||0,lightTheme:options.theme==='light'?1:0};
 for(const [key,value]of Object.entries(values))gl.uniform1f(locations[key],value);
 [palette.base[0],palette.base[1],...palette.ribbons.flat()].forEach((color,i)=>gl.uniform3fv(locations[['base0','base1','c0','c1','c2','c3','c4','c5'][i]],rgb(color).map(x=>x/255)));
 gl.drawArrays(gl.TRIANGLES,0,6);ctx.clearRect(0,0,size,size);ctx.drawImage(canvas,0,1024-pixels,pixels,pixels,0,0,size,size);
}

// One scheduler for all mounted orbs. Only visible, moving instances enter the loop.
const active=new Set();let timer=0;
function tick(now){timer=0;for(const item of active)item.frame(now);if(active.size)timer=requestAnimationFrame(tick);}
function wake(item){active.add(item);if(!timer)timer=requestAnimationFrame(tick);}
function sleep(item){active.delete(item);if(!active.size&&timer){cancelAnimationFrame(timer);timer=0;}}
export function mountOrb(canvas, initial={}) {
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return {update(){},destroy(){}};
 let options={state:'idle',intensity:1,concept:'flow',palette:'marble',...initial};
 let visible=true,disposed=false,dirty=true,last=0,clock=0,angle=.55,speed=.13,activity=.08,pulse=0,energy=0,tokenEnergy=0,transient=0;
 let size=36,previousState=options.state,frames=0;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const reduced=()=>gpuUnavailable || options.reducedMotion || media.matches || document.documentElement.dataset.motion==='reduced';
 const paint=()=>{
  const dpr=Math.min(devicePixelRatio||1,2);const pixels=Math.max(1,Math.round(size*dpr));
  if(canvas.width!==pixels||canvas.height!==pixels){canvas.width=pixels;canvas.height=pixels;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawOrb(ctx,size,{...options,time:reduced()?.55:angle,activity:reduced()?.08:activity+tokenEnergy*.12,pulse:reduced()?0:pulse,amplitude:reduced()?0:energy,error:options.state==='error'?Math.exp(-transient*1.7):0});
  canvas.dataset.frames=String(++frames);canvas.dataset.state=options.state;canvas.dataset.renderer='canvas';dirty=false;
 };
 const sync=()=>{if(disposed)return;const can=visible&&!document.hidden&&size>0;if(can&&(dirty||!reduced()&&!options.paused))wake(item);else sleep(item);};
 const item={frame(now){
  const fps=size<=40?12:30;if(last&&now-last<1000/fps)return;
  const dt=Math.min(.1,last?(now-last)/1000:1/fps);last=now;
  if(!reduced()&&!options.paused){
   clock+=dt;transient+=dt;tokenEnergy*=Math.exp(-dt*3);
   const state=(options.state==='success'||options.state==='error')&&transient>1.5?'idle':options.state;
   const target=profiles[state]||profiles.idle,k=1-Math.exp(-dt*4);
   speed+=(target[0]*clamp(options.intensity,0,2)-speed)*k;activity+=(target[1]-activity)*k;
   energy+=(clamp(options.amplitude)-energy)*k;
   const expansion=state==='success'?Math.sin(Math.min(1,transient/1.5)*Math.PI):0;
   pulse+=(expansion-pulse)*k;angle+=dt*speed;
  }
  paint();if(reduced()||options.paused)sleep(item);
 }};
 const resize=new ResizeObserver(entries=>{size=entries[0].contentRect.width;dirty=true;sync();});resize.observe(canvas);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;sync();});intersection.observe(canvas);
 const mutation=new MutationObserver(()=>{dirty=true;sync();});mutation.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion','data-theme']});
 const visibility=()=>{last=0;sync();};document.addEventListener('visibilitychange',visibility);media.addEventListener('change',visibility);
 // Paint the palette immediately, including in background native windows.
 size=canvas.getBoundingClientRect().width || 36;paint();sync();
 return {update(next){if(next.tokenCount>options.tokenCount)tokenEnergy=Math.min(1,tokenEnergy+.2);options={...options,...next};if(options.state!==previousState){transient=0;previousState=options.state;}dirty=true;sync();},destroy(){disposed=true;sleep(item);resize.disconnect();intersection.disconnect();mutation.disconnect();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',visibility);}};
}
