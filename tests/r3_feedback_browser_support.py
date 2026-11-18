"""Open a frame in the approved private sidebar and wait for that frame's ready receipt."""
import re

import json
from uuid import uuid4
from playwright.sync_api import expect


def prepare_frame_pointer(page):
    if getattr(page, "_qa_pointer_installed", False):
        return
    page._qa_pointer_installed = True
    page.add_init_script("""if(window!==top){
        for(const type of ['pointerdown','pointerup','pointercancel','click'])window.addEventListener(type,e=>{
            const arm=window.__qaArmedPointer;
            if(!arm)return;
            console.debug('__qa_physical_pointer__'+JSON.stringify({
                id:arm.id,phase:type,trusted:e.isTrusted,hit:arm.el.contains(e.target),
                pointer:e.pointerType||'mouse'
            }));
            if(type===arm.last)window.__qaArmedPointer=null;
        },true);
    }""")


class ReviewScreens:
    def __init__(self, page, origin, width):
        self.page = page
        prepare_frame_pointer(page)
        self.width = width
        page.add_init_script("""if(window === top) window.addEventListener('message', event=>{
            const frame = document.getElementById('frame');
            if(frame && event.source===frame.contentWindow && event.origin==='null' &&
               event.data?.scope==='ORDER_R3_FRAME' && event.data.type==='ready') {
                frame.dataset.testReadyHash=event.data.artifact;
            }
        });""")
        page.goto(f"{origin}/ia?view=qa-lab&width={width}")
        expect(page.locator("#frame")).to_have_attribute("data-test-ready-hash", re.compile(r'^[0-9a-f]{64}$'), timeout=30000)
        self.current_module = None

    def screen(self, module, state):
        page = self.page
        target = f"{module}/{state}/email"
        if self.current_module == module:
            control = page.locator(f'#state-buttons [data-state="{state}"]')
        else:
            if page.locator("#open").is_visible() and "nav-open" not in (page.locator("#lab").get_attribute("class") or ""):
                page.locator("#open").click()
            page.locator("#catalog-search").fill(target)
            control = page.locator(f'#catalog [data-module="{module}"]')
        expect(control).to_have_count(1)
        with page.expect_response(lambda res: "/r3-qa/artifact?" in res.url
                                  and f"id={module}%2F{state}%2Femail" in res.url
                                  and f"width={self.width}&" in res.url) as pending:
            control.click()
        response = pending.value
        assert response.ok, (target, self.width, response.status)
        expect(page.locator("#frame")).to_have_attribute("data-test-ready-hash", response.json()["hash"])
        frame = page.frame_locator("#frame")
        frame.locator("#r3-veil").wait_for(state="attached")
        self.current_module = module
        return frame


def frame_pointer_position(page, locator, position=None):
    """Find the visible child control in both documents, accounting for the review scale."""
    expect(locator).to_be_visible()
    locator.element_handle().wait_for_element_state("stable")
    point = locator.evaluate("""async (el, relative) => {
        el.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'});
        // A native vertical swipe may still be scrolling the document even when a fixed modal is stable.
        const chain=[];for(let p=el;p;p=p.parentElement)chain.push(p);
        let previous='',still=0;
        for(let tick=0;tick<100&&still<5;tick++){
            await new Promise(requestAnimationFrame);
            const r=el.getBoundingClientRect();
            const now=[r.x,r.y,r.width,r.height,scrollX,scrollY,...chain.flatMap(p=>[p.scrollLeft,p.scrollTop])].join(',');
            still=now===previous?still+1:0;previous=now;
        }
        if(still<5)throw Error('Target or ancestor scroll is still moving');
        const r=el.getBoundingClientRect();
        const clip={left:0, top:0, right:innerWidth, bottom:innerHeight};
        for(let p=el.parentElement;p&&p!==document.documentElement;p=p.parentElement){
            const cs=getComputedStyle(p), b=p.getBoundingClientRect();
            if(/auto|scroll|hidden|clip/.test(cs.overflowX)){
                clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right);
            }
            if(/auto|scroll|hidden|clip/.test(cs.overflowY)){
                clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom);
            }
        }
        const left=Math.max(r.left,clip.left),right=Math.min(r.right,clip.right);
        const top=Math.max(r.top,clip.top),bottom=Math.min(r.bottom,clip.bottom);
        const x=relative?r.left+relative.x:(left+right)/2;
        const y=relative?r.top+relative.y:(top+bottom)/2;
        const hit=document.elementFromPoint(x,y);
        if(!hit||!el.contains(hit)||left>=right||top>=bottom)
            throw Error('Child hit for '+el.outerHTML.slice(0,130)+' at '+[x,y]+' intercepted by '+(hit?.outerHTML||'outside viewport').slice(0,190));
        return {x,y};
    }""", position)
    result = page.locator("#frame").evaluate("""(frame, point) => {
        function mapped(){
            const b=frame.getBoundingClientRect();
            return {x:b.left+(frame.clientLeft+point.x)*b.width/frame.offsetWidth,
                    y:b.top+(frame.clientTop+point.y)*b.height/frame.offsetHeight};
        }
        for(let p=frame.parentElement;p;p=p.parentElement){
            const topLevel=p===document.scrollingElement,cs=getComputedStyle(p);
            const r=topLevel?{left:0,top:0,right:innerWidth,bottom:innerHeight}:p.getBoundingClientRect();
            const {x,y}=mapped();
            const dx=x<r.left+3||x>=r.right-3?x-(r.left+r.right)/2:0;
            const dy=y<r.top+3||y>=r.bottom-3?y-(r.top+r.bottom)/2:0;
            if(dx&&(topLevel||/auto|scroll/.test(cs.overflowX)))p.scrollLeft+=dx;
            if(dy&&(topLevel||/auto|scroll/.test(cs.overflowY)))p.scrollTop+=dy;
        }
        const pointAt=mapped(),hit=document.elementFromPoint(pointAt.x,pointAt.y);
        if(hit!==frame)
            throw Error('Outer hit at '+[pointAt.x,pointAt.y]+' intercepted by '+(hit?.outerHTML||'outside viewport').slice(0,190));
        return pointAt;
    }""", point)
    return result["x"], result["y"]


def frame_click(page, locator, position=None, *, activation="click"):
    x, y = frame_pointer_position(page, locator, position)
    request_id = uuid4().hex
    locator.evaluate("(el,arg)=>{window.__qaArmedPointer={el,id:arg.id,last:arg.last};}", {"id":request_id,"last":activation})
    touch = page.evaluate("navigator.maxTouchPoints>0")
    def is_receipt(message):
        return message.text.startswith('__qa_physical_pointer__') and request_id in message.text
    def event_for(phase):
        return lambda m:is_receipt(m) and f'"phase":"{phase}"' in m.text
    with page.expect_console_message(predicate=event_for("pointerdown"), timeout=5000) as down:
        with page.expect_console_message(predicate=event_for(activation), timeout=5000) as result:
            if touch:
                page.touchscreen.tap(x, y)
            else:
                page.mouse.click(x, y)
    for captured in (down,result):
        receipt=json.loads(captured.value.text.removeprefix('__qa_physical_pointer__'))
        assert receipt["trusted"] and receipt["hit"], "Physical "+receipt["phase"]+" did not reach the requested child control"
    down_receipt=json.loads(down.value.text.removeprefix('__qa_physical_pointer__'))
    assert down_receipt["pointer"]==("touch" if touch else "mouse")
    if not getattr(page, "_qa_reported_frame_pointer", False):
        print(f"PASS scaled frame {down_receipt['pointer']}: parent iframe hit, child control hit, trusted pointerdown and {activation}",flush=True)
        page._qa_reported_frame_pointer = True
