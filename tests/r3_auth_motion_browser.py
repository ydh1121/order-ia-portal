"""Exercise the pointer and keyboard entry points in the authenticated catalog."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect
from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position


def check_auth_motion(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("onboarding", "guest-2")
    header = frame.locator(".ob-stage > header")
    header.evaluate("""el=>{window.__savedBrand=el.querySelector('svg');window.__jellyMotion=[];
        window.__savedBrand.addEventListener('code1:motionstart',e=>window.__jellyMotion.push(e.detail.kind));}""")
    frame_click(page, frame.locator("[data-action=animate-brand]"))
    expect(header).to_be_visible()
    frame.locator(".ob.guest").evaluate("""el=>new Promise((resolve,reject)=>{
      if(window.__jellyMotion.includes('gather'))return resolve();
      const id=setTimeout(()=>reject(Error('guest logo did not trigger archived CODE1')),2000);
      window.__savedBrand.addEventListener('code1:motionstart',()=>{clearTimeout(id);resolve();},{once:true});
    })""")
    frame_click(page, frame.locator("[data-mf-intro='3']"))
    expect(frame.locator(".ob")).to_have_attribute("data-intro-step", "3")
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
                "guestClick": "CODE1 gather", "headerNodeSurvived": True,
                "rubberBandUp30": resistance, "peekAndDragClose": True,
                "otpHeightBeforeAndAfter": [before, otp.bounding_box()["height"]]}
    frame = screens.screen("signup", "empty")
    meter = frame.locator(".password-meter")
    password = frame.locator("[name=password]")
    password.fill("a")
    expect(meter).to_have_attribute("data-level", "1")
    password.evaluate("""el=>document.addEventListener('input',()=>{
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
    meter.screenshot(path=str(out / "password-06-liquid-link-133ms.png"), animations="allow")
    settled = meter.evaluate("""el=>{for(const a of el.getAnimations({subtree:true}))a.currentTime=202;
        return Number(getComputedStyle(el.querySelectorAll('em')[1]).opacity);}""")
    assert settled < .05, settled
    meter.screenshot(path=str(out / "password-06-liquid-link-202ms.png"), animations="allow")
    evidence["video6Boundary"]={"strengthFrom":1,"strengthTo":2,"activeNecks":active["edges"],
                                "neckOpacity133ms":active["alpha"],"neckOpacity202ms":settled}
    (out / f"auth-motion-{width}.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
