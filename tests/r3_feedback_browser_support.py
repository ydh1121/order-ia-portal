"""Open a frame in the approved private sidebar and wait for that frame's ready receipt."""
import re

from uuid import uuid4
from playwright.sync_api import expect


class ReviewScreens:
    def __init__(self, page, origin, width):
        self.page = page
        self.width = width
        page.add_init_script("""if(window === top) window.addEventListener('message', event=>{
            const frame = document.getElementById('frame');
            if(frame && event.source===frame.contentWindow && event.origin==='null' &&
               event.data?.scope==='ORDER_R3_FRAME' && event.data.type==='ready') {
                frame.dataset.testReadyHash=event.data.artifact;
            }
        });""")
        page.goto(f"{origin}/ia?view=qa-lab&width={width}")
        expect(page.locator("#frame")).to_have_attribute("data-test-ready-hash", re.compile(r'^[0-9a-f]{64}$'))
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
    point = locator.evaluate("""(el, relative) => {
        el.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'});
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


def frame_click(page, locator, position=None):
    x, y = frame_pointer_position(page, locator, position)
    request_id = uuid4().hex
    page.evaluate("""id=>{
        const frame=document.getElementById('frame');
        function receive(ev){
            if(ev.source!==frame.contentWindow||ev.origin!=='null'||ev.data?.testPointerId!==id)return;
            window.removeEventListener('message',receive);
            (window.__qaPointerReceipts??=Object.create(null))[id]=ev.data;
        }
        window.addEventListener('message',receive);
    }""", request_id)
    locator.evaluate("""(el,id)=>{
        document.addEventListener('pointerdown',e=>parent.postMessage({
            testPointerId:id, trusted:e.isTrusted, hit:el.contains(e.target), type:e.pointerType
        },'*'),{once:true,capture:true});
    }""", request_id)
    touch = page.evaluate("navigator.maxTouchPoints>0")
    if touch:
        page.touchscreen.tap(x, y)
    else:
        page.mouse.click(x, y)
    result = page.wait_for_function("id=>window.__qaPointerReceipts?.[id]", arg=request_id, timeout=3500)
    receipt = result.json_value()
    page.evaluate("id=>delete window.__qaPointerReceipts[id]", request_id)
    assert receipt["trusted"] and receipt["hit"], "Physical pointer did not reach the requested child control"
    assert receipt["type"] == ("touch" if touch else "mouse"), receipt["type"]
    if not getattr(page, "_qa_reported_frame_pointer", False):
        print(f"PASS scaled frame {receipt['type']}: parent iframe hit, child control hit, isTrusted=true",flush=True)
        page._qa_reported_frame_pointer = True
