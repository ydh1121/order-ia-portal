"""Exercise the pointer and keyboard entry points in the authenticated catalog."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect
from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position


def capture_password_meter(page, meter, path):
    # The review canvas scales the iframe. Capture the top-level pixels of the
    # visible meter using the same verified hit point as physical pointer tests.
    midpoint = frame_pointer_position(page, meter)
    area = meter.evaluate("""el=>{
        const box=el.getBoundingClientRect();
        return {width:box.width,height:box.height};
    }""")
    clip = page.locator("#frame").evaluate("""(frame,{midpoint,area})=>{
        const box=frame.getBoundingClientRect();
        const width=area.width*box.width/frame.offsetWidth;
        const height=area.height*box.height/frame.offsetHeight;
        const left=Math.max(0,Math.floor(midpoint[0]-width/2));
        const top=Math.max(0,Math.floor(midpoint[1]-height/2));
        return {x:left+scrollX,y:top+scrollY,
                width:Math.min(innerWidth,Math.ceil(midpoint[0]+width/2))-left,
                height:Math.min(innerHeight,Math.ceil(midpoint[1]+height/2))-top};
    }""", {"midpoint": midpoint, "area": area})
    page.screenshot(path=str(path), clip=clip, animations="allow")


def check_email_message(page, screens):
    frame = screens.screen("login", "filled")
    email = frame.locator("[name=email]")
    password = frame.locator("[name=password]")
    submit = frame.locator("[data-action=submit-login]")
    email.evaluate("""el=>{
        window.__emailTyping=[];
        el.addEventListener('input',event=>window.__emailTyping.push({trusted:event.isTrusted,type:event.inputType}));
    }""")
    frame_click(page, email)
    page.keyboard.press("Control+A")
    page.keyboard.type("invalid-email.order.ooo", delay=12)
    frame_click(page, password)
    page.keyboard.press("Control+A")
    page.keyboard.type("NativeOnly!2026", delay=8)
    expect(email).to_have_value("invalid-email.order.ooo")
    expect(password).to_have_value("NativeOnly!2026")
    # Settle the scaled submit position before arming a frame-by-frame observer.
    # Its 1800ms message must be captured even if the click receipt is delayed.
    frame_pointer_position(page, submit)
    email.evaluate("""input=>{
        const field=input.closest('.field'),display=field.querySelector('.inline-field-state');
        if(!display)throw Error('The shared inline message hook is missing');
        const submit=document.querySelector('[data-action=submit-login]'),password=document.querySelector('[name=password]');
        const emailController=window.OrderEmailUI?.instance(input),syntax=window.OrderEmail?.parse(input.value);
        if(!emailController||input.type!=='text'||input.inputMode!=='email'||syntax?.valid!==false)
            throw Error('The original regular email editor and parser are not connected');
        const fixture=window.ORDER_APP_ADAPTER?.fixture,fixtureBefore=fixture?.inspect();
        if(!fixtureBefore)throw Error('The canonical QA fixture inspector is missing');
        const fixtureData=JSON.stringify(fixtureBefore.data),mutations=snapshot=>snapshot.calls.filter(call=>!['GET','HEAD','OPTIONS'].includes(call.method)).length;
        const controller=new AbortController(),armed=performance.now();
        const state=window.__emailMessage={armed,clickedAt:null,trustedClick:false,done:false,error:null,samples:[],
            before:{value:input.value,placeholder:input.placeholder,type:input.type,start:input.selectionStart,end:input.selectionEnd},
            typing:window.__emailTyping,firstVisible:null,hiddenAt:null};
        submit.addEventListener('click',event=>{state.clickedAt=performance.now();state.trustedClick=event.isTrusted;},{capture:true,signal:controller.signal});
        const transparent=color=>color==='transparent'||/^rgba\\([^)]*,\\s*0(?:\\.0+)?\\)$/.test(color);
        function sample(now){
            const cs=getComputedStyle(input),shown=getComputedStyle(display),box=display.getBoundingClientRect();
            const visible=field.classList.contains('shows-message')&&shown.display!=='none'&&shown.visibility!=='hidden'&&Number(shown.opacity)>0&&box.width>0&&box.height>0;
            if(state.clickedAt!==null){
                if(visible&&state.firstVisible===null)state.firstVisible=now-state.clickedAt;
                if(!visible&&state.firstVisible!==null&&state.hiddenAt===null)state.hiddenAt=now-state.clickedAt;
                state.samples.push({at:now-state.clickedAt,visible,message:display.textContent,value:input.value,
                    sameInput:document.querySelector('[name=email]')===input,invalid:input.getAttribute('aria-invalid'),
                    focused:document.activeElement===input,textHidden:transparent(cs.webkitTextFillColor),
                    passwordPreserved:password.value==='NativeOnly!2026'});
            }
            if(state.hiddenAt!==null&&now-state.clickedAt>=state.hiddenAt+100){
                const fixtureAfter=fixture.inspect();
                state.fixture={dataUnchanged:JSON.stringify(fixtureAfter.data)===fixtureData,
                    authenticatedUnchanged:fixtureAfter.controls.authenticated===fixtureBefore.controls.authenticated,
                    mutationCalls:mutations(fixtureAfter)-mutations(fixtureBefore),operations:fixtureAfter.operations.length-fixtureBefore.operations.length};
                state.after={value:input.value,placeholder:input.placeholder,type:input.type,start:input.selectionStart,end:input.selectionEnd,
                    sameInput:document.querySelector('[name=email]')===input,focused:document.activeElement===input,
                    invalid:input.getAttribute('aria-invalid'),messageHidden:!visible,textHidden:transparent(cs.webkitTextFillColor),
                    sameController:window.OrderEmailUI.instance(input)===emailController,
                    syntaxValid:window.OrderEmail.parse(input.value).valid,inputMode:input.inputMode};
                state.done=true;controller.abort();return;
            }
            if(now-armed>6000){state.error='Shared email message did not visibly appear and restore';state.done=true;controller.abort();return;}
            requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
    }""")
    writes = []
    def observe_request(request):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            writes.append({"method": request.method, "path": urlsplit(request.url).path})
    page.on("request", observe_request)
    try:
        frame_click(page, submit)
        receipt = email.evaluate("""el=>new Promise(resolve=>{
            function read(){if(window.__emailMessage.done)resolve(window.__emailMessage);else requestAnimationFrame(read);}read();
        })""")
    finally:
        page.remove_listener("request", observe_request)
    assert receipt["error"] is None and receipt["trustedClick"], receipt
    assert receipt["typing"] and all(event["trusted"] for event in receipt["typing"]), receipt
    visible = [sample for sample in receipt["samples"] if sample["visible"]]
    assert len(visible) >= 3 and all(sample["message"] == "이메일 양식을 확인해 주세요." and sample["textHidden"] for sample in visible), receipt
    assert 1750 <= receipt["hiddenAt"] <= 2500, receipt
    assert all(sample["sameInput"] and sample["value"] == "invalid-email.order.ooo" and sample["passwordPreserved"] for sample in receipt["samples"]), receipt
    after = receipt["after"]
    assert after["sameInput"] and after["focused"] and after["messageHidden"] and not after["textHidden"], receipt
    assert after["invalid"] == "true" and after["type"] == receipt["before"]["type"] == "text", receipt
    assert after["sameController"] and not after["syntaxValid"] and after["inputMode"] == "email", receipt
    assert (after["value"], after["placeholder"], after["start"], after["end"]) == tuple(receipt["before"][key] for key in ("value", "placeholder", "start", "end")), receipt
    assert receipt["fixture"] == {"dataUnchanged": True, "authenticatedUnchanged": True, "mutationCalls": 0, "operations": 0}, receipt
    assert writes == [], writes
    expect(email).to_have_value("invalid-email.order.ooo")
    expect(email).to_have_attribute("aria-invalid", "true")
    expect(email).to_be_focused()
    message = frame.locator(".field").filter(has=email).locator(".inline-field-state")
    expect(message).to_have_count(1)
    expect(message).to_be_hidden()
    receipt["mutationRequests"] = writes
    return receipt


def check_guest_cards(page, screens):
    frame = screens.screen("onboarding", "guest-4")
    cards = frame.locator(".ob-mode.card")
    expect(cards).to_have_count(2)
    receipts = []
    for index in range(2):
        card = cards.nth(index)
        x, y = frame_pointer_position(page, frame.locator("#order-app-header"))
        page.mouse.move(x, y)
        size = card.evaluate("el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})")
        points = [frame_pointer_position(page, card, {"x": size["width"] * x, "y": size["height"] * y})
                  for x, y in ((.2, .25), (.8, .75), (.2, .75))]
        card.evaluate("""card=>{
            const icon=card.querySelector('[data-intro-icon]'),lens=icon?.querySelector('[data-icon-lens]');
            if(!icon||!lens)throw Error('The original introductory icon is missing');
            const label=card.querySelector('[data-magnetic-label]')||card.querySelector(':scope > span');
            const nodes={card,surface:card.querySelector('[data-magnetic-material]')||card,label,icon};
            const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
            const before=Object.fromEntries(Object.entries(nodes).map(([name,el])=>[name,box(el)]));
            const controller=new AbortController(),armed=performance.now();
            const state=window.__guestCard={icon:icon.dataset.introIcon,firstPointer:null,done:false,moves:[],
                magneticOwner:card.hasAttribute('data-magnetic-action'),magneticChildren:card.querySelectorAll('[data-magnetic-material],[data-magnetic-label]').length,
                reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,maxDelta:{card:0,surface:0,label:0,icon:0},
                iconMatrices:[],activeIconFrames:0,sameNodes:true};
            card.addEventListener('pointermove',event=>{
                state.firstPointer??=performance.now();state.moves.push({trusted:event.isTrusted,pointer:event.pointerType,x:event.clientX,y:event.clientY});
            },{capture:true,signal:controller.signal});
            function sample(now){
                if(state.firstPointer!==null){
                    for(const[name,el]of Object.entries(nodes)){
                        const next=box(el),original=before[name];
                        state.maxDelta[name]=Math.max(state.maxDelta[name],...Object.keys(original).map(key=>Math.abs(next[key]-original[key])));
                    }
                    state.sameNodes&&=card.isConnected&&card.querySelector('[data-intro-icon]')===icon&&icon.querySelector('[data-icon-lens]')===lens;
                    const matrix=getComputedStyle(lens).transform;if(!state.iconMatrices.includes(matrix))state.iconMatrices.push(matrix);
                    if(icon.getAnimations({subtree:true}).some(animation=>animation.playState==='running'))state.activeIconFrames++;
                }
                if(state.firstPointer!==null&&now-state.firstPointer>1150||now-armed>6000){state.done=true;controller.abort();return;}
                requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
        }""")
        for x, y in points:
            page.mouse.move(x, y, steps=8)
            card.evaluate("""el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))""")
        receipt = card.evaluate("""el=>new Promise(resolve=>{
            function read(){if(window.__guestCard.done)resolve(window.__guestCard);else requestAnimationFrame(read);}read();
        })""")
        assert not receipt["reduced"] and not receipt["magneticOwner"] and receipt["magneticChildren"] == 0, receipt
        assert receipt["sameNodes"] and len(receipt["moves"]) >= 3, receipt
        assert all(event["trusted"] and event["pointer"] == "mouse" for event in receipt["moves"]), receipt
        assert max(event["x"] for event in receipt["moves"]) - min(event["x"] for event in receipt["moves"]) >= size["width"] * .4, receipt
        assert all(delta <= .5 for delta in receipt["maxDelta"].values()), receipt
        assert receipt["activeIconFrames"] >= 3 and len(receipt["iconMatrices"]) >= 3, receipt
        receipts.append(receipt)
    assert {receipt["icon"] for receipt in receipts} == {"search", "file-search"}, receipts
    return receipts


def check_auth_motion(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("onboarding", "guest-2")
    header = frame.locator("#order-app-header")
    expect(frame.locator(".ob-pages .ob-active-pill")).to_be_visible()
    # Figma 2009173058 requires random original motion on a guest click. The
    # shared trigger selects CODE1 idle/play or gather; neither is a fake event
    # nor an account-menu action. Arm observations before the physical click so
    # its synchronous event cannot be lost while waiting for an assumed kind.
    header.evaluate("""el=>{
        const svg=window.__savedBrand=el.querySelector('svg');
        const paths=[...svg.querySelectorAll('g > path')],before=paths.map(p=>p.getAttribute('d'));
        window.__guestMotion={trusted:false,started:[],changed:new Set(),paths};
        el.querySelector('.obm-trigger').addEventListener('click',event=>{
            window.__guestMotion.trusted=event.isTrusted;
        },{capture:true,once:true});
        svg.addEventListener('code1:motionstart',event=>{
            if(window.__guestMotion.trusted)window.__guestMotion.started.push({...event.detail});
        });
        window.__guestMotionObserver=new MutationObserver(()=>{
            if(!window.__guestMotion.started.length)return;
            paths.forEach((path,index)=>{if(path.getAttribute('d')!==before[index])window.__guestMotion.changed.add(index);});
        });
        window.__guestMotionObserver.observe(svg,{subtree:true,attributes:true,attributeFilter:['d']});
    }""")
    brand_trigger = frame.locator(".obm-trigger")
    expect(frame.locator(".obm-brand")).to_have_attribute("data-authenticated", "false")
    expect(brand_trigger).to_have_accessible_name("Order 로고")
    assert brand_trigger.get_attribute("aria-haspopup") is None
    frame_click(page, brand_trigger)
    expect(header).to_be_visible()
    expect(frame.locator(".obm-panel")).to_be_hidden()
    guest_motion=frame.locator(".ob.guest").evaluate("""el=>new Promise((resolve,reject)=>{
        const receipt=window.__guestMotion,start=performance.now();
        function check(){
            const motion=receipt.started[0];
            if(receipt.trusted&&motion&&receipt.changed.size===3){
                window.__guestMotionObserver.disconnect();
                return resolve({trustedClick:receipt.trusted,kind:motion.kind,seed:motion.seed,
                    changedPathCount:receipt.changed.size,pathCount:receipt.paths.length,
                    samePaths:receipt.paths.every((path,index)=>window.__savedBrand.querySelectorAll('g > path')[index]===path)});
            }
            if(performance.now()-start>2000){
                window.__guestMotionObserver.disconnect();
                return reject(Error('guest CODE1 did not animate all three original paths after trusted click: '+JSON.stringify({trusted:receipt.trusted,started:receipt.started,changed:[...receipt.changed]})));
            }
            requestAnimationFrame(check);
        }
        check();
    })""")
    assert guest_motion['trustedClick'] and guest_motion['samePaths'],guest_motion
    assert guest_motion['kind'] in ('idle','gather'),guest_motion
    assert isinstance(guest_motion['seed'],int) and 0<=guest_motion['seed']<=0xffffffff,guest_motion
    assert guest_motion['pathCount']==guest_motion['changedPathCount']==3,guest_motion
    expect(frame.locator(".obm-panel")).to_be_hidden()
    frame_click(page, frame.locator("[data-mf-intro='3']"))
    expect(frame.locator(".ob")).to_have_attribute("data-intro-step", "3")
    assert header.evaluate("el=>el.querySelector('svg')===window.__savedBrand")
    x3, y3 = frame_pointer_position(page, frame.locator("[data-mf-intro='3']"))
    x1, y1 = frame_pointer_position(page, frame.locator("[data-mf-intro='1']"))
    page.mouse.move(x3, y3)
    page.mouse.down()
    page.mouse.move(x1, y1, steps=7)
    page.mouse.up()
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step", "1")
    assert header.evaluate("el=>el.querySelector('svg')===window.__savedBrand")
    frame_click(page, frame.locator("[data-company-open]"))
    expect(frame.locator(".ob-stage")).to_have_js_property("inert", True)
    grip = frame.locator(".ob-grip")
    drawer = frame.locator(".ob-drawer")
    scale = page.locator("#frame").bounding_box()["width"] / drawer.evaluate("el=>window.innerWidth")
    def start_drag():
        x, y = frame_pointer_position(page, grip)
        page.mouse.move(x, y)
        page.mouse.down()
        return x, y
    x, y = start_drag()
    page.mouse.move(x, y - 30 * scale, steps=5)
    resistance = drawer.evaluate("el=>new DOMMatrix(getComputedStyle(el).transform).m42")
    assert -30 < resistance < 0, resistance
    page.mouse.up()
    expect(drawer).to_have_attribute("data-sheet-snap", "open")
    x, y = start_drag()
    page.mouse.move(x, y + 78 * scale, steps=5)
    page.mouse.up()
    expect(drawer).to_have_attribute("data-sheet-snap", "peek")
    x, y = start_drag()
    page.mouse.move(x, y + 98 * scale, steps=8)
    page.mouse.up()
    expect(drawer).to_be_hidden()
    expect(frame.locator("[data-company-open]")).to_be_focused()

    guest_cards = check_guest_cards(page, screens)
    email_message = check_email_message(page, screens)

    frame = screens.screen("otp", "error")
    otp = frame.locator(".otp-wrap")
    reason = frame.locator("[data-otp-feedback]")
    expect(otp.locator("input")).to_have_count(6)
    expect(otp.locator("input").first).to_have_attribute("aria-invalid", "true")
    assert reason.inner_text().strip()
    assert reason.evaluate("el=>getComputedStyle(el).clipPath==='inset(50%)'")
    assert otp.evaluate("el=>['none','normal','\"\"'].includes(getComputedStyle(el,'::after').content)")
    before = otp.bounding_box()["height"]
    otp.locator("input").first.fill("1")
    expect(otp.locator("input").first).to_have_attribute("aria-invalid", "false")
    assert abs(otp.bounding_box()["height"] - before) <= 1
    out = Path(os.getenv("R3_AUTH_MOTION_ARTIFACT_DIR", "artifacts/r3-auth-motion"))
    out.mkdir(parents=True, exist_ok=True)
    evidence = {"width": width, "source": "private signed QA browser fixture",
                "guestClick": "Figma 2009173058: trusted shared trigger → random original CODE1 idle/play or gather, all three original paths change; no account dropdown",
                "guestMotion":guest_motion,"guestAllowedKinds":["idle","gather"],
                "headerNodeSurvived": True, "pagination": "click 2→3, physical drag 3→1",
                "rubberBandUp30": resistance, "peekAndDragClose": True,
                "guestCardsStationary": guest_cards, "emailValidationMessage": email_message,
                "otpHeightBeforeAndAfter": [before, otp.bounding_box()["height"]]}
    frame = screens.screen("signup", "empty")
    meter = frame.locator(".password-meter")
    password = frame.locator("[name=password]")
    password.fill("a")
    expect(meter).to_have_attribute("data-level", "1")
    # The canonical sheet stops input bubbling; observe on this same input after
    # its already-mounted meter handler, before the enclosing sheet barrier.
    password.evaluate("""el=>el.addEventListener('input',()=>{
       const bars=document.querySelector('.password-meter');
       window.__boundary=bars.getAnimations({subtree:true}).filter(a=>a.effect.target?.localName==='em');
       for(const animation of bars.getAnimations({subtree:true})){animation.pause();animation.currentTime=133;}
    },{once:true})""")
    password.fill("abcdefg")
    expect(meter).to_have_attribute("data-level", "2")
    active = meter.evaluate("""el=>({edges:window.__boundary.length,
        alpha:Number(getComputedStyle(el.querySelectorAll('em')[1]).opacity),
        time:window.__boundary[0]?.currentTime})""")
    assert active["edges"] == 1 and active["alpha"] > .8, active
    capture_password_meter(page, meter, out / "password-06-liquid-link-133ms.png")
    settled = meter.evaluate("""el=>{for(const a of el.getAnimations({subtree:true}))a.currentTime=202;
        return Number(getComputedStyle(el.querySelectorAll('em')[1]).opacity);}""")
    assert settled < .05, settled
    capture_password_meter(page, meter, out / "password-06-liquid-link-202ms.png")
    evidence["video6Boundary"]={"strengthFrom":1,"strengthTo":2,"activeNecks":active["edges"],
                                "neckOpacity133ms":active["alpha"],"neckOpacity202ms":settled}
    (out / f"auth-motion-{width}.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
