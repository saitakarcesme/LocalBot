import {html,useRef,useEffect,useLayoutEffect} from './lib.js';
import {mountOrb} from './orb-renderer.js';
/** Public reusable identity component. amplitude is real microphone RMS, 0..1. */
export function LocalBotOrb({size,state='idle',intensity=1,palette='marble',theme='dark',concept='flow',amplitude=0,tokenCount=0,reducedMotion=false,paused=false,label}) {
 const ref=useRef(),renderer=useRef();
 useLayoutEffect(()=>{renderer.current=mountOrb(ref.current,{state,intensity,palette,theme,concept,amplitude,tokenCount,reducedMotion,paused});return()=>renderer.current.destroy();},[]);
 useEffect(()=>renderer.current?.update({state,intensity,palette,theme,concept,amplitude,tokenCount,reducedMotion,paused}),[state,intensity,palette,theme,concept,amplitude,tokenCount,reducedMotion,paused]);
 return html`<span class="localbot-orb figure" style=${size ? `width:${size}px;height:${size}px` : undefined} role=${label?'img':undefined} aria-label=${label} aria-hidden=${label?undefined:'true'}><img src="/assets/orb.svg" alt=""/><canvas ref=${ref}/></span>`;
}
