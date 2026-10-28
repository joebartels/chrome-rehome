import { expect, test } from 'vitest';
import { createPopupView, mountPopup } from '../../src/popup/view';
import type { PopupState } from '../../src/popup/controller';
const state = (phase: 'active'|'paused'|'checking'|'unavailable'|'blocked', savedEnabled: boolean|null = true): PopupState => ({ status: { version:{workerId:'w',revision:1}, phase, savedEnabled }, targetChecking:false,busy:false,message:'' });
test.each(['active','paused','checking','unavailable','blocked'] as const)('renders truthful %s phase regardless of saved flag', phase => {
  const view=createPopupView(state(phase)); expect(view.heading.toLowerCase()).toContain(phase === 'unavailable' ? 'unavailable' : phase === 'blocked' ? 'blocked' : phase);
  if(phase!=='active') expect(view.heading).not.toMatch(/^Active/); expect(view.resumeDisabled).toBe(phase!=='paused');
  expect(view.pauseDisabled).toBe(false);
});
test('unknown status disables mutations; busy blocks repeated commands', () => {
  expect(createPopupView({targetChecking:true,busy:false,message:''})).toMatchObject({pauseDisabled:true,resumeDisabled:true,protectionDisabled:true});
  expect(createPopupView({...state('active'),busy:true})).toMatchObject({pauseDisabled:true,resumeDisabled:true,protectionDisabled:true});
});
test('manual protection is separate from pinned/audible exclusions and is available paused', () => {
  const value={...state('paused',false),target:{receipt:{tabId:1,windowId:2,incognito:false,documentId:'d'},protected:false,pinned:true,audible:true}};
  expect(createPopupView(value)).toMatchObject({protectionDisabled:false,protected:false});
  expect(createPopupView(value).targetMessage).toMatch(/pinned.*audio|audio.*pinned/i);
  expect(createPopupView({...value,target:{...value.target,protected:true}}).protected).toBe(true);
});
test('unsupported/checking target leaves global controls available; blocked has no reset advice', () => {
  expect(createPopupView(state('active'))).toMatchObject({pauseDisabled:false,protectionDisabled:true});
  expect(createPopupView(state('blocked')).description).not.toMatch(/reset|refresh.*repair/i);
});
test('mount uses stable native controls, text content, and removes subscriptions/listeners on disposal', () => {
  function el() { const events=new Map<string,()=>void>(); return {textContent:'',disabled:false,checked:false,dataset:{} as Record<string,string>,setAttribute(){},addEventListener(n:string,f:()=>void){events.set(n,f);},removeEventListener(n:string){events.delete(n);},events}; }
  const elements={heading:el(),description:el(),message:el(),targetMessage:el(),pause:el(),resume:el(),protect:el(),refresh:el(),settings:el()};
  let render!:(state:PopupState)=>void; const calls:string[]=[];
  const controller={subscribe(f:typeof render){render=f;f(state('paused'));return()=>calls.push('detach');},setEnabled:async(v:boolean)=>{calls.push(String(v));},protect:async()=>{},refresh:async()=>{},openSettings:async()=>{},dispose(){calls.push('dispose');}};
  const mounted=mountPopup(elements as unknown as Parameters<typeof mountPopup>[0],controller);
  elements.resume.events.get('click')!(); expect(calls).toContain('true');
  render({...state('unavailable'),message:'<script>literal</script>'}); expect(elements.message.textContent).toBe('<script>literal</script>');
  expect(elements.pause.disabled).toBe(false); mounted.dispose(); expect(calls).toContain('detach'); expect(elements.resume.events.size).toBe(0);
});

test('pending mutation displays applying rather than claiming the previous active state',()=>{
  const view=createPopupView({...state('active'),busy:true,message:'Applying change…'});
  expect(view.heading).toBe('Applying change…'); expect(view.description).not.toMatch(/are active/);
});
