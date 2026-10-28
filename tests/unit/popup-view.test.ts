import { expect, test } from 'vitest';
import { createPopupView, mountPopup } from '../../src/popup/view';
import type { PopupState } from '../../src/popup/controller';
const state = (phase: 'active'|'paused'|'checking'|'unavailable'|'blocked', savedEnabled: boolean|null = true): PopupState => ({ connection: 'connected', status: { version:{workerId:'w',revision:1}, phase, savedEnabled }, targetChecking:false,busy:false,message:'' });
test.each(['active','paused','checking','unavailable','blocked'] as const)('renders truthful %s phase regardless of saved flag', phase => {
  const view=createPopupView(state(phase)); expect(view.heading.toLowerCase()).toContain(phase === 'unavailable' ? 'unavailable' : phase === 'blocked' ? 'blocked' : phase);
  if(phase!=='active') expect(view.heading).not.toMatch(/^Active/); expect(view.resumeDisabled).toBe(phase!=='paused');
  expect(view.pauseDisabled).toBe(false);
});
test('unknown status disables mutations; busy blocks repeated commands', () => {
  expect(createPopupView({connection:'checking',targetChecking:true,busy:false,message:''})).toMatchObject({pauseDisabled:true,resumeDisabled:true,protectionDisabled:true});
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

test('failed first connection shows reconnect guidance without claiming an available Pause', () => {
  const view = createPopupView({ connection: 'unavailable', targetChecking: false, busy: false, message: '' });
  expect(view.heading).toMatch(/unavailable/i); expect(view.heading).not.toMatch(/checking/i);
  expect(view.description).toMatch(/refresh.*reconnect/i);
  expect(view.description).not.toMatch(/Pause may safely/i);
  expect(view).toMatchObject({ pauseDisabled: true, resumeDisabled: true, protectionDisabled: true, severity: 'error' });
  expect(view.targetMessage).not.toMatch(/Global Pause remains available/i);
});
test('target guidance offers Pause only while the actual Pause action is available', () => {
  const known = { ...state('unavailable'), connection: 'unavailable' as const };
  expect(createPopupView(known).targetMessage).toMatch(/Global Pause remains available/i);
  expect(createPopupView(known).description).toMatch(/Explicit Pause may safely/i);
  expect(createPopupView({ ...known, busy: true }).targetMessage).not.toMatch(/Global Pause remains available/i);
});
