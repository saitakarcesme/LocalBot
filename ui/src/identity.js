import {html,useRef,useEffect,useState} from './lib.js';
export const FIGURE_COLORS = [['White','#eeeef2'],['Sky','#86c5f7'],['Mint','#7fd8b0'],['Rose','#f2a2c8'],['Lilac','#b5a3e5'],['Amber','#f3c66f'],['Coral','#f49a83']];
export const FIGURE_STATES = ['idle','thinking','typing','coding','researching','reading','listening','speaking','success','error'];
export function LocalBotFigure({size,state='idle',label,color='#eeeef2',amplitude=0,paused=false}) {
 const ref=useRef();
 const [settled,setSettled]=useState(false);
 useEffect(()=>{setSettled(false);if(!['success','error'].includes(state))return;const timer=setTimeout(()=>setSettled(true),1400);return()=>clearTimeout(timer);},[state]);
 const mapped=settled?'idle':{generating:'typing',working:'typing',waiting:'idle',sleeping:'idle'}[state] || state;
 useEffect(()=>{
  const el=ref.current;
  const visibility=()=>el.classList.toggle('is-paused',document.hidden);
  const observer=new IntersectionObserver(entries=>el.classList.toggle('is-offscreen',!entries[0].isIntersecting));
  observer.observe(el); document.addEventListener('visibilitychange',visibility); visibility();
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
 },[]);
 return html`<span ref=${ref} class=${'localbot-figure figure state-'+mapped+(paused?' is-paused':'')} style=${`${size?`width:${size}px;height:${size}px;`:''}--figure-color:${/^#[0-9a-f]{6}$/i.test(color)?color:'#eeeef2'};--voice-scale:${1+Math.min(1,Math.max(0,amplitude||0))*.06}`} role=${label?'img':undefined} aria-label=${label} aria-hidden=${label?undefined:'true'}>
  <svg viewBox="0 0 100 100" focusable="false"><g class="figure-body"><circle class="figure-disc" cx="50" cy="50" r="46"/><g class="figure-gaze"><g class="figure-blink"><path class="eye-left" d="M30 34 V59 H44"/><path class="eye-right" d="M58 34 V59 H72"/></g></g></g></svg>
 </span>`;
}
