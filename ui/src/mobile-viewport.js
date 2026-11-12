import {api,mobileOrigin} from './lib.js';
// Keep the app inside the visible iOS viewport, including keyboard panning.
export function installMobileViewport() {
 const root=document.documentElement,view=window.visualViewport;
 let frame,reportTimer;
 const update=()=>{
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   const editing=!!document.activeElement?.matches('input,textarea,[contenteditable=true]');
   const keyboard=editing&&!!view&&innerHeight-view.height>150;
   root.style.setProperty('--viewport-height',keyboard?view.height+'px':'100%');
   root.style.setProperty('--viewport-top',(keyboard?view.offsetTop:0)+'px');
   root.dataset.keyboard=String(keyboard);
   if(mobileOrigin){clearTimeout(reportTimer);reportTimer=setTimeout(()=>{
    const rect=document.getElementById('root').getBoundingClientRect();
    api('mobile-viewport',{screen:[screen.width,screen.height],inner:[innerWidth,innerHeight],visual:view?{height:view.height,top:view.offsetTop,scale:view.scale}:null,root:{top:rect.top,bottom:rect.bottom,height:rect.height},standalone:!!navigator.standalone,display:matchMedia('(display-mode: standalone)').matches,keyboard,status:document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content}).catch(()=>{});
   },250);}

  });
 };
 const preventPinch=e=>{if(e.type.startsWith('gesture')||e.touches?.length>1)e.preventDefault();};
 view?.addEventListener('resize',update);view?.addEventListener('scroll',update);
 window.addEventListener('resize',update);
 document.addEventListener('gesturestart',preventPinch,{passive:false});
 document.addEventListener('gesturechange',preventPinch,{passive:false});
 document.addEventListener('touchmove',preventPinch,{passive:false});
 const meta=document.querySelector('meta[name="viewport"]'),previous=meta.content;
 meta.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
 update();
 return()=>{
  cancelAnimationFrame(frame);clearTimeout(reportTimer);meta.content=previous;
  view?.removeEventListener('resize',update);view?.removeEventListener('scroll',update);window.removeEventListener('resize',update);
  document.removeEventListener('gesturestart',preventPinch);document.removeEventListener('gesturechange',preventPinch);document.removeEventListener('touchmove',preventPinch);
  root.style.removeProperty('--viewport-top');root.style.removeProperty('--viewport-height');delete root.dataset.keyboard;
 };
}
