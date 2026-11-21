import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const support=readFileSync(new URL('./r3_feedback_browser_support.py',import.meta.url),'utf8');
const init=support.match(/page\.add_init_script\("""([\s\S]*?)"""\)/)[1];
const arm=support.match(/armed = locator\.evaluate\("""([\s\S]*?)""",/)[1];
const phases=['pointerdown','pointerup','click'];

function fixture(t){
    const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only',virtualConsole:new VirtualConsole()});
    t.after(()=>dom.window.close());
    const w=dom.window.document.querySelector('iframe').contentWindow;
    assert.notEqual(w,w.top,'evaluate the actual init script in a child realm');
    w.document.body.innerHTML='<input id="control" type="checkbox">';
    const control=w.document.getElementById('control'),logs=[];
    w.console.debug=message=>logs.push(JSON.parse(message.slice('__qa_physical_pointer__'.length)));
    const descriptor=Object.getOwnPropertyDescriptor(w.Event.prototype,'stopImmediatePropagation');
    let nativeCalls=0;
    const nativeResult={nativeResult:true};
    Object.defineProperty(w.Event.prototype,'stopImmediatePropagation',{...descriptor,value:function(...args){
        nativeCalls++;
        Reflect.apply(descriptor.value,this,args);
        return nativeResult;
    }});
    const install=()=>w.eval(init);
    const armed=()=>w.eval('('+arm+')')(control,{id:'physical-request',last:'click'});
    const dispatch=type=>{
        const event=new w.MouseEvent(type,{bubbles:true,cancelable:true});
        const result=control.dispatchEvent(event);
        return {event,result};
    };
    return {w,control,logs,descriptor,nativeResult,install,armed,dispatch,get nativeCalls(){return nativeCalls;}};
}

function pickingBarrier(f){
    const calls=[],returns=[],blocked=[];
    for(const type of phases){
        f.w.addEventListener(type,event=>{
            calls.push(type);
            event.preventDefault();
            returns.push(event.stopImmediatePropagation());
        },true);
        f.w.addEventListener(type,()=>blocked.push('later-window-capture'),true);
        f.control.addEventListener(type,()=>blocked.push('target'));
    }
    return {calls,returns,blocked};
}

function assertPhysicalEvidenceRemainsUntrusted(f,observer){
    assert.deepEqual(f.logs.map(receipt=>receipt.phase),phases);
    assert.equal(f.w.__qaPointerReceipts.length,3);
    assert.equal(f.w.__qaPointerTimeline.length,3);
    for(const receipt of f.logs){
        assert.equal(receipt.trusted,false,'dispatchEvent must never become trusted input');
        assert.equal(receipt.hit,true);
        assert.equal(receipt.pointer,'mouse');
        assert.equal(receipt.observer,observer);
        assert.equal(receipt.id,'physical-request');
    }
    assert.equal(f.w.__qaArmedPointer,null);
}

test('a picking barrier registered before the probe remains effective and its real events are observed',t=>{
    const f=fixture(t),barrier=pickingBarrier(f);
    const hostStop=f.w.top.Event.prototype.stopImmediatePropagation;
    f.install();f.armed();
    for(const phase of phases){
        const {event,result}=f.dispatch(phase);
        assert.equal(event.isTrusted,false);
        assert.equal(event.defaultPrevented,true);
        assert.equal(result,false);
    }
    assert.deepEqual(barrier.calls,phases);
    assert.deepEqual(barrier.blocked,[],'native capture propagation is still stopped');
    assert.equal(f.control.checked,false,'canceled checkbox activation stays canceled');
    assert.equal(f.nativeCalls,3,'delegate the native method exactly once per call');
    assert.ok(barrier.returns.every(value=>value===f.nativeResult),'preserve the delegated return value');
    assertPhysicalEvidenceRemainsUntrusted(f,'capture-barrier');
    const wrapped=Object.getOwnPropertyDescriptor(f.w.Event.prototype,'stopImmediatePropagation');
    for(const key of ['writable','enumerable','configurable'])assert.equal(wrapped[key],f.descriptor[key]);
    assert.equal(f.w.top.Event.prototype.stopImmediatePropagation,hostStop,'leave the host realm untouched');
});

test('an early capture probe and the later barrier observe each event only once',t=>{
    const f=fixture(t);
    f.install();f.armed();
    const barrier=pickingBarrier(f);
    for(const phase of phases)f.dispatch(phase);
    assertPhysicalEvidenceRemainsUntrusted(f,'capture');
    assert.equal(f.nativeCalls,3);
    assert.deepEqual(barrier.blocked,[]);
});

test('reinstalling before arming preserves document identity and timeline without stacking wrappers',t=>{
    const f=fixture(t);
    f.install();
    f.dispatch('pointerdown');
    const token=f.w.__qaPointerDocument,timeline=f.w.__qaPointerTimeline;
    const wrapper=f.w.Event.prototype.stopImmediatePropagation;
    const barrier=pickingBarrier(f);
    f.install();f.armed();f.armed();
    assert.equal(f.w.__qaPointerDocument,token);
    assert.equal(f.w.__qaPointerTimeline,timeline);
    assert.equal(timeline.length,1,'keep the pre-arm diagnostic event');
    assert.equal(f.w.Event.prototype.stopImmediatePropagation,wrapper);
    f.dispatch('click');
    assert.equal(f.logs.length,1);
    assert.equal(f.logs[0].observer,'capture-barrier');
    assert.equal(timeline.length,2);
    assert.equal(f.nativeCalls,1);
    assert.deepEqual(barrier.blocked,[]);
});

test('observer errors cannot change native propagation, return values, or exceptions',t=>{
    const f=fixture(t),barrier=pickingBarrier(f);
    f.install();f.armed();
    f.w.__qaPointerTimeline.push=()=>{throw Error('observer unavailable');};
    const {event,result}=f.dispatch('click');
    assert.equal(event.defaultPrevented,true);
    assert.equal(result,false);
    assert.deepEqual(barrier.blocked,[]);
    assert.equal(barrier.returns[0],f.nativeResult);
    assert.equal(f.nativeCalls,1);
    assert.equal(f.logs.length,0,'an observer failure cannot invent a passing receipt');
    assert.match(f.w.__qaPointerObserverError,/observer unavailable/);
    let expected;
    try{Reflect.apply(f.descriptor.value,{},[]);}catch(error){expected=error;}
    assert.ok(expected);
    assert.throws(()=>Reflect.apply(f.w.Event.prototype.stopImmediatePropagation,{},[]),error=>
        error.name===expected.name&&error.message===expected.message);
    assert.equal(f.nativeCalls,2,'a native exception still comes from one delegated call');
});
