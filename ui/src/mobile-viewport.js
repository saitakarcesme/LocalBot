// Keep the app inside the visible iOS viewport, including keyboard panning.
export function installMobileViewport() {
 const root=document.documentElement,view=window.visualViewport;
 let frame;
 const update=()=>{
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   const editing=!!document.activeElement?.matches('input,textarea,[contenteditable=true]');
   const keyboard=editing&&!!view&&innerHeight-view.height>150;
   root.style.setProperty('--viewport-height',keyboard?view.height+'px':'100dvh');
   root.style.setProperty('--viewport-top',(keyboard?view.offsetTop:0)+'px');
   root.dataset.keyboard=String(keyboard);
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
  cancelAnimationFrame(frame);meta.content=previous;
  view?.removeEventListener('resize',update);view?.removeEventListener('scroll',update);window.removeEventListener('resize',update);
  document.removeEventListener('gesturestart',preventPinch);document.removeEventListener('gesturechange',preventPinch);document.removeEventListener('touchmove',preventPinch);
  root.style.removeProperty('--viewport-top');root.style.removeProperty('--viewport-height');delete root.dataset.keyboard;
 };
}
