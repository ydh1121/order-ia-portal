(function () {
  "use strict";
  window.ORDER_DESIGN_MODULES = window.ORDER_DESIGN_MODULES || [];
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const U=window.QAUI;
  
  const paths = {
    chevron: "m6 9 6 6 6-6",
    back: "m15 18-6-6 6-6",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M18 6 6 18",
    check: "m5 12 4 4L19 6",
    home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
    file: "M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 12h8M8 16h8",
    wallet: "M3 5h17v15H3zM3 5V3h13M15 11h6v5h-6z",
    menu: "M4 6h16M4 12h16M4 18h16",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    copy: "M8 8h12v13H8zM16 8V3H3v13h5",
    clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  };
  const icon = (name) =>
    '<svg class="qa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
    paths[name] +
    '"/></svg>';
  const btn = (text, action, primary, extra) =>
    '<button type="button" class="btn ' +
    (primary ? "primary" : "secondary") +
    '" data-qa-action="' +
    action +
    '" ' +
    (extra || "") +
    ">" +
    text +
    "</button>";
  const brand = (options) =>
    (options && options.brand) || '<strong class="qa-wordmark">Order.</strong>';
  const quoteHead = (options) =>
    '<header class="qa-quote-head">' +
    brand(options) +
    '</header><button type="button" class="qa-back" data-qa-action="back" aria-label="이전 화면">' +
    icon("back") +
    '</button><h1 class="page-title">어떤 계란의 최저가를<br>알아볼까요?</h1>';
  const sectionHead = (title, done, open) =>
    "<" +
    (open
      ? 'button type="button" data-qa-action="toggle-question" aria-expanded="true"'
      : "div") +
    ' class="qa-question-head"> <span class="qa-check ' +
    (done ? "is-done" : "") +
    '">' +
    (done ? icon("check") : "") +
    "</span><h2>" +
    title +
    '</h2><span class="qa-caret ' +
    (open ? "is-open" : "") +
    '">' +
    icon("chevron") +
    "</span></" +
    (open ? "button" : "div") +
    ">";
  const summaryBlock = (title, dest) =>
    '<button type="button" class="qa-question-short" data-qa-action="route" data-target="' +
    dest +
    '">' +
    sectionHead(title, true, false) +
    "</button>";
  const quoteFooter = () =>
    '<footer class="qa-form-footer">' +
    btn("임시저장", "draft", false) +
    btn("입력 내용 확인", "review", true) +
    '</footer><button class="qa-reset" type="button" data-qa-action="reset">입력 초기화</button>';
  function quoteScope(root) {
    return root.matches(".qa-quote")
      ? root
      : root.querySelector(".qa-quote") || root;
  }
  function toggleQuestion(button) {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    button.querySelector(".qa-caret").classList.toggle("is-open", open);
    [...button.parentElement.children]
      .filter((el) => el !== button)
      .forEach((el) => (el.hidden = !open));
  }
  function setQuestionDone(root, done) {
    const indicator = root.querySelector(
      ".qa-question > .qa-question-head .qa-check",
    );
    if (!indicator) return;
    indicator.classList.toggle("is-done", done);
    indicator.innerHTML = done ? icon("check") : "";
  }
  function dialogKey(root, e, close) {
    const dialog = root.querySelector("[role=dialog]");
    if (!dialog) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const focusable = [
        ...dialog.querySelectorAll(
          "button:not([disabled]),input:not([disabled]),select:not([disabled])",
        ),
      ];
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  const notify = (api, text) => {
    if (api && api.toast) api.toast(text);
  };
  const select = (api, id, state) => {
    if (api && api.select) api.select(id, state);
  };
  const success = (api, button) => {
    if (api && api.demoSuccess) api.demoSuccess(button);
  };
  const itemSeeds = [
    {
      shell: "1",
      key: "egg-king",
      size: "왕란",
      pack: "30구",
      quantity: "월 600판",
      price: null,
    },
    {
      shell: "2",
      key: "egg-special",
      size: "특란",
      pack: "30구",
      quantity: "월 400판",
      price: null,
    },
    {
      shell: "2",
      key: "egg-large",
      size: "대란",
      pack: "30구",
      quantity: "월 200판",
      price: null,
    },
  ];
  const tag = value => value ? '<span class="qf-tag">'+esc(value)+'</span>' : '';
  function itemRow(item,i){
    const badges=[item.quantity,item.price].filter(Boolean).map(tag).join('');
    return '<article class="qa-item-row qf-stack" id="qf-'+esc(item.key)+'" data-item-row="'+i+'"><button type="button" class="qf-main" data-qa-action="edit-item" data-index="'+i+'"><strong>'+
      esc(item.shell+'번 '+item.size+' '+item.pack)+'</strong>'+(badges?'<span class="qf-tags">'+badges+'</span>':'')+
      '</button><button type="button" class="qf-remove" data-qa-action="remove-item" data-index="'+i+'" aria-label="이 계란 규격 삭제">삭제</button></article>';
  }
  function eggDialog(error) {
    return (
      '<div class="qa-modal-backdrop" data-egg-modal><section class="qa-mini-modal" role="dialog" aria-modal="true" aria-labelledby="qa-egg-dialog-title"><header><h2 id="qa-egg-dialog-title">계란 규격</h2><button type="button" class="qa-icon-button" data-qa-action="close-egg" aria-label="닫기">' +
      icon("close") +
      '</button></header><fieldset><legend>난각번호 <span aria-hidden="true">*</span></legend><div class="qa-choice-grid four">' +
      ["1", "2", "3", "4"]
        .map(
          (v) =>
            '<button type="button" aria-invalid="'+error+'" data-choice="shell" data-value="' +
            v +
            '" aria-pressed="' +
            (!error && v === "2") +
            '">' +
            v +
            "</button>",
        )
        .join("") +
      '</div></fieldset><fieldset><legend>계란 크기 <span aria-hidden="true">*</span></legend><div class="qa-choice-grid five">' +
      ["왕란", "특란", "대란", "중란", "소란"]
        .map(
          (v, i) =>
            '<button type="button" data-choice="size" data-value="' +
            v +
            '" aria-pressed="' +
            (v === "특란") +
            '"><span class="qa-egg-shape" style="--egg-size:' +
            (23 - i * 2) +
            'px"></span>' +
            v +
            "</button>",
        )
        .join("") +
      '</div></fieldset><fieldset><legend>포장 <span aria-hidden="true">*</span></legend><div class="qa-choice-grid three">' +
      ["10구", "20구", "30구"]
        .map(
          (v) =>
            '<button type="button" data-choice="pack" data-value="' +
            v +
            '" aria-pressed="' +
            (v === "30구") +
            '">' +
            v +
            "</button>",
        )
        .join("") +
      '</div></fieldset><p class="qa-field-error" data-egg-error role="alert" ' +
      (!error ? "hidden" : "") +
      ">난각번호를 선택해 주세요.</p><footer>" +
      btn("취소", "close-egg", false) +
      btn("저장", "save-egg", true) +
      "</footer></section></div>"
    );
  }
  function q1Render(state, options) {
    const empty = state === "before";
    return (
      '<div class="qa-quote" data-module="q1" data-state="' +
      state +
      '">' +
      quoteHead(options) +
      '<section class="qa-question">' +
      sectionHead("계란 규격", !empty, true) +
      "<div data-egg-list>" +
      (!empty
        ? itemSeeds.map(itemRow).join("")
        : '') +
      '</div><div class="qa-center-action">' +
      btn("계란 추가", "add-item", false) +
      "</div>" +
      btn("계란 규격 완료", "finish-q1", true,empty?"hidden":"") +
      "</section>" +
      summaryBlock("현재 구매량과 가격", "q2") +
      summaryBlock("납품받을 사업장", "q3") +
      summaryBlock("주문 방식", "q4") +
      quoteFooter() +
      (state === "edit" || state === "error"
        ? eggDialog(state === "error")
        : "") +
      "</div>"
    );
  }
  function q1Mount(root, state, api, registerAction) {
    root = quoteScope(root);
    let items = state === "before" ? [] : itemSeeds.map((x) => ({ ...x })),
      editing = state === "edit" ? 1 : null;
    const draw = () => {
      root.querySelector("[data-egg-list]").innerHTML = items.length
        ? items.map(itemRow).join("")
        : '';
      root.querySelector('[data-qa-action="finish-q1"]').hidden=!items.length;
      setQuestionDone(root, items.length > 0);
    };
    const close = () => root.querySelector("[data-egg-modal]")?.remove();
    const open = (i) => {
      close();
      editing = i;
      root.insertAdjacentHTML("beforeend", eggDialog(false));
      const item = i === null ? null : items[i];
      if (item)
        root
          .querySelectorAll("[data-choice]")
          .forEach((b) =>
            b.setAttribute(
              "aria-pressed",
              String(b.dataset.value === item[b.dataset.choice]),
            ),
          );
      root.querySelector("[data-choice]")?.focus();
    };
    const actOn = (target) => {
      const choice = target.closest("[data-choice]");
      if (choice) {
        choice.closest("fieldset")?.classList.remove("is-error","is-shaking");
        choice.closest('fieldset')?.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
        root
          .querySelectorAll('[data-choice="' + choice.dataset.choice + '"]')
          .forEach((b) => b.setAttribute("aria-pressed", String(b === choice)));
        return;
      }
      const b = target.closest("[data-qa-action]");
      if (!b) return;
      const a = b.dataset.qaAction;
      if (a === "toggle-question") toggleQuestion(b);
      else if (a === "add-item") open(null);
      else if (a === "edit-item") open(Number(b.dataset.index));
      else if (a === "remove-item") {
        items.splice(Number(b.dataset.index), 1);
        draw();
        notify(api, "계란 규격을 삭제했어요.");
      } else if (a === "close-egg") close();
      else if (a === "save-egg") {
        const chosen = {};
        ["shell", "size", "pack"].forEach(
          (k) =>
            (chosen[k] = root.querySelector(
              '[data-choice="' + k + '"][aria-pressed="true"]',
            )?.dataset.value),
        );
        if (Object.values(chosen).some((v) => !v)) {
          root.querySelector("[data-egg-error]").hidden = false;
          const sets=[...root.querySelectorAll('.qa-mini-modal fieldset')];
          sets.forEach(set=>{const invalid=!set.querySelector('[aria-pressed="true"]');set.classList.toggle('is-error',invalid);set.querySelectorAll('button').forEach(el=>el.setAttribute('aria-invalid',String(invalid)));if(invalid)U.shake(set);});
          sets.find(set=>set.classList.contains('is-error'))?.querySelector('button')?.focus();
          return;
        }
        if (editing !== null && items[editing])
          items[editing] = { ...items[editing], ...chosen };
        else
          items.push({
            key: crypto.randomUUID(), ...chosen,
            quantity: null,
            price: null,
          });
        close();
        draw();
        notify(api, "계란 규격을 저장했어요.");
      } else if (a === "finish-q1") {
        if (!items.length) {
          open(null);
          return;
        }
        select(api, "q2", "empty");
      } else if (a === "route")
        select(
          api,
          b.dataset.target,
          b.dataset.target === "q1" ? "selected" : b.dataset.target === "q2" ? "empty" : "closed",
        );
      else if (a === "review") select(api, "quote-review", "normal");
      else if (a === "reset") {
        items = [];
        draw();
        close();
      } else if (a === "back") notify(api, "첫 단계예요.");
      else if (a === "draft") {
        success(api, b);
        select(api,"quote-review","saved");
      }
    };
    registerAction(actOn);
    const handler = (e) => actOn(e.target);
    const key = (e) => dialogKey(root, e, close);
    root.addEventListener("click", handler);
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("click", handler);
      root.removeEventListener("keydown", key);
    };
  }
  const venueSeeds = [
    {
      name: "첫 번째 매장",
      region: "서울 송파구",
      address: "예시로 10",
      email: "sample@example.test",
      phone: "010-0000-0000",
    },
    {
      name: "두 번째 매장",
      region: "서울 마포구",
      address: "예시로 20",
      email: "sample@example.test",
      phone: "010-0000-0000",
    },
    {
      name: "세 번째 매장",
      region: "경기 성남시",
      address: "예시로 30",
      email: "sample@example.test",
      phone: "010-0000-0000",
    },
  ];
  function assignedRows(venueId) {
    return itemSeeds.map((it,i)=>'<li id="qf-link-'+venueId+'-'+i+'" class="qa-assigned-item qf-stack"><button type="button" class="qf-main" data-qa-action="edit-order"><strong>'+
      esc(it.shell+'번 '+it.size+' '+it.pack)+'</strong><span class="qf-tags">'+tag(['소진 시','정기배송','협의'][i])+tag('회당 '+[12,100,14][i]+'판')+
      '</span></button><button type="button" class="qf-remove" data-qa-action="detach-item">해제</button></li>').join('');
  }
  function venueRow(v, i, opened, incomplete) {
    const pid = "qa-venue-panel-" + i;
    return (
      '<article class="qa-venue-row ' +
      (incomplete ? "is-incomplete" : "") +
      '" data-venue="' +
      i +
      '" data-region="' +
      esc(v.region || "") +
      '" data-address="' +
      esc(v.address || "") +
      '"><button type="button" class="qa-disclosure" data-qa-action="toggle-row" aria-expanded="' +
      opened +
      '" aria-controls="' +
      pid +
      '"><span class="qa-row-main"><strong class="qa-venue-name">' +
      esc(v.name) +
      '</strong><span class="qa-row-summary">' +
      "<span data-venue-region>" +
      esc(v.region || "지역 입력 전") +
      "</span><br><span data-venue-count>납품 품목 3개</span>" +
      (incomplete ? "<em>연락처를 입력해 주세요</em>" : "") +
      '</span></span><span class="qa-caret">' +
      icon("chevron") +
      '</span></button><div class="qa-venue-panel" id="' +
      pid +
      '" ' +
      (!opened ? "hidden" : "") +
      '><dl class="qa-venue-details"><div class="full"><dt>사업장 소재지</dt><dd data-contact-address>' +
      esc((v.region || "") + " " + (v.address || "")) +
      "</dd></div><div><dt>담당자 연락처</dt><dd data-contact-phone>" +
      (incomplete ? "입력 전" : esc(v.phone)) +
      '</dd><button type="button" data-qa-action="copy-contact" aria-label="이 사업장의 연락처를 다른 사업장에 복사">'+icon("copy")+'연락처 복사</button></div><div><dt>이메일</dt><dd>'  +
      esc(v.email) +
      '</dd></div></dl><div class="qa-venue-tools"><div><button type="button" data-qa-action="edit-venue">수정</button><button type="button" data-qa-action="delete-venue">삭제</button></div></div><div class="qa-assigned-heading"><h3>납품받을 품목</h3><span class="muted" data-item-count>3개</span></div><ul class="qa-assigned-list">' +
      assignedRows(i) +
      "</ul></div></article>"
    );
  }
  function q3Render(state, options) {
    const long = state === "long-name",
      incomplete = state === "incomplete";
    const venues = venueSeeds.map((v, i) => ({
      ...v,
      name:
        long && i === 0
          ? "처음 방문하신 손님과 단체 예약을 함께 맞이하는 첫 번째 매장"
          : v.name,
    }));
    return (
      '<div class="qa-quote" data-module="q3" data-state="' +
      state +
      '">' +
      quoteHead(options) +
      summaryBlock("계란 규격", "q1") +
      summaryBlock("현재 구매량과 가격", "q2") +
      '<section class="qa-question">' +
      sectionHead("납품받을 사업장", !incomplete, true) +
      '<div class="qa-venue-list">' +
      venues
        .map((v, i) =>
          venueRow(v, i, state !== "closed" && i === 0, incomplete && i === 0),
        )
        .join("") +
      '</div><div class="qa-center-action">' +
      btn(icon("plus") + "사업장 추가", "add-venue", false) +
      "</div>" +
      btn("사업장 설정 완료", "finish-q3", true) +
      "</section>" +
      summaryBlock("주문 방식", "q4") +
      quoteFooter() +
      "</div>"
    );
  }
  function q3Mount(root, state, api, registerAction) {
    root = quoteScope(root);
    let added = 3;
    let editing = null;
    let pendingRow = null;
    function close(commit = false) {
      root.querySelector("[data-venue-modal]")?.remove();
      if (pendingRow && !commit) pendingRow.remove();
      pendingRow = null;
      editing = null;
      setQuestionDone(
        root,
        !root.querySelector(".is-incomplete") &&
          !!root.querySelector("[data-venue]"),
      );
    }
    function edit(row, created = false) {
      close();
      editing = row;
      pendingRow = created ? row : null;
      const name = row.querySelector(".qa-venue-name").textContent;
      root.insertAdjacentHTML(
        "beforeend",
        '<div class="qa-modal-backdrop" data-venue-modal><section class="qa-mini-modal" role="dialog" aria-modal="true" aria-labelledby="qa-venue-edit-title"><header><h2 id="qa-venue-edit-title">사업장 수정</h2><button type="button" class="qa-icon-button" data-qa-action="close-venue" aria-label="닫기">' +
          icon("close") +
          '</button></header>' +
          U.field('사업장 이름','venueName','사업장 이름',{value:name,max:80,required:true})+
          U.field('지역','venueRegion','서울 송파구',{value:row.dataset.region,max:40,required:true})+
          U.field('상세주소','venueAddress','도로명, 건물 번호',{value:row.dataset.address,max:80,required:true})+
          U.field('담당자 연락처','venuePhone','010-0000-0000',{value:row.querySelector('[data-contact-phone]').textContent==='입력 전'?'':row.querySelector('[data-contact-phone]').textContent,type:'tel',autocomplete:'tel',mode:'tel',max:20,required:true})+
          '<p class="qa-field-error" data-venue-error role="alert" hidden>사업장 이름, 주소와 연락처를 입력해 주세요.</p><footer>' +
          btn("취소", "close-venue", false) +
          btn("저장", "save-venue", true) +
          "</footer></section></div>",
      );
      root.querySelector("[name=venueName]")?.focus();
    }
    const actOn = (target) => {
      const b = target.closest("[data-qa-action]");
      if (!b) return;
      const a = b.dataset.qaAction,
        row = b.closest("[data-venue]");
      if (a === "toggle-question") toggleQuestion(b);
      else if (a === "toggle-row") {
        const panel = root.querySelector("#" + b.getAttribute("aria-controls"));
        const next = b.getAttribute("aria-expanded") !== "true";
        b.setAttribute("aria-expanded", String(next));
        panel.hidden = !next;
      } else if (a === "edit-venue") edit(row);
      else if (a === "close-venue") close();
      else if (a === "save-venue") {
        const name = root.querySelector("[name=venueName]").value.trim(),
          phone = root.querySelector("[name=venuePhone]").value.trim(),
          region = root.querySelector("[name=venueRegion]").value.trim(),
          address = root.querySelector("[name=venueAddress]").value.trim();
        if (!name || !phone || !region || !address) {
          root.querySelector("[data-venue-error]").hidden = false;
          const fields=[...root.querySelectorAll('[data-venue-modal] input')];
          fields.forEach(input=>{U.setFieldError(input,input.value.trim()?'':'필수 정보예요.');if(!input.value.trim())U.shake(input.closest('.field'));});
          fields.find(input=>!input.value.trim())?.focus();
          return;
        }
        editing.querySelector(".qa-venue-name").textContent = name;
        editing.dataset.region = region;
        editing.dataset.address = address;
        editing.querySelector("[data-venue-region]").textContent = region;
        editing.querySelector("[data-contact-address]").textContent =
          region + " " + address;
        editing.querySelector("[data-contact-phone]").textContent = phone;
        editing.classList.remove("is-incomplete");
        editing.querySelector("em")?.remove();
        close(true);
        root.querySelector('[data-qa-action="finish-q3"]').hidden=false;
        notify(api, "사업장 정보를 저장했어요.");
      } else if (a === "delete-venue") {
        row.remove();
        const hasVenues=Boolean(root.querySelector('[data-venue]'));
        root.querySelector('[data-qa-action="finish-q3"]').hidden=!hasVenues;
        setQuestionDone(root,hasVenues&&!root.querySelector('.is-incomplete'));
        notify(api, "사업장을 삭제했어요.");
      } else if (a === "add-venue") {
        const n = ++added;
        root.querySelector(".qa-venue-list").insertAdjacentHTML(
          "beforeend",
          venueRow(
            {
              name: "새 사업장 " + n,
              region: "",
              address: "",
              email: "sample@example.test",
            },
            n,
            true,
            true,
          ),
        );
        edit(root.querySelector('[data-venue="' + n + '"]'), true);
      } else if (a === "copy-contact") {
        const phone = row.querySelector("[data-contact-phone]").textContent;
        if (phone === "입력 전") {
          notify(api, "먼저 연락처를 입력해 주세요.");
          return;
        }
        root.querySelectorAll("[data-contact-phone]").forEach((el) => {
          el.textContent = phone;
          const venue = el.closest("[data-venue]");
          if (venue.dataset.region && venue.dataset.address) {
            venue.classList.remove("is-incomplete");
            venue.querySelector("em")?.remove();
          }
        });
        notify(api, "다른 사업장에 연락처를 복사했어요.");
      } else if (a === "detach-item") {
        const list = b.closest(".qa-assigned-list");
        b.closest(".qa-assigned-item").remove();
        const count = list.children.length;
        row.querySelector("[data-item-count]").textContent = count + "개";
        row.querySelector("[data-venue-count]").textContent =
          "납품 품목 " + count + "개";
      } else if (a === "edit-order") select(api, "q4", "open");
      else if (a === "finish-q3" || a === "review") {
        if (root.querySelector(".is-incomplete")) {
          edit(root.querySelector(".is-incomplete"));
          return;
        }
        if (!root.querySelector("[data-venue]")) {
          const add=root.querySelector('[data-qa-action="add-venue"]');U.shake(add);add?.focus();
          return;
        }
        select(api, a === "review" ? "quote-review" : "q4", a === "review" ? "normal" : "open");
      } else if (a === "route")
        select(
          api,
          b.dataset.target,
          b.dataset.target === "q1" ? "selected" : b.dataset.target === "q2" ? "empty" : "closed",
        );
      else if (a === "back") select(api, "q1", "selected");
      else if (a === "reset") select(api, "q3", "incomplete");
      else if (a === "draft") {
        success(api, b);
        select(api,"quote-review","saved");
      }
      setQuestionDone(
        root,
        !root.querySelector(".is-incomplete") &&
          !!root.querySelector("[data-venue]"),
      );
    };
    registerAction(actOn);
    const handler = (e) => actOn(e.target);
    const key = (e) => dialogKey(root, e, close);
    root.addEventListener("click", handler);
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("click", handler);
      root.removeEventListener("keydown", key);
    };
  }
  function q4Row(item, i, open, missing) {
    const types = ["협의", "소진 시", "정기배송", "1회 배송"];
    return (
       '<article class="qa-order-row" id="qf-order-'+i+'"><button type="button" class="qa-disclosure" data-qa-action="toggle-row" aria-expanded="' +
      open +
      '" aria-controls="qa-order-panel-' +
      i +
      '"><span class="qa-row-main"><strong>' +
      esc(item.shell + "번 " + item.size + " " + item.pack) +
      '</strong><span class="qa-row-summary"><span data-order-venue-count>' +
      (i === 2 ? "1개 사업장" : "3개 사업장") +
      "</span><span data-order-summary>" +
      (missing ? "주문 방식 입력 전" : i === 2 ? "정기배송" : "혼합 주문") +
      '</span></span></span><span class="qa-caret">' +
      icon("chevron") +
      '</span></button><div class="qa-order-panel" id="qa-order-panel-' +
      i +
      '" ' +
      (!open ? "hidden" : "") +
      ">" +
      venueSeeds
        .slice(0, i === 2 ? 1 : 3)
        .map(
          (v, j) =>
            '<div class="qa-order-venue" id="qf-order-'+i+'-venue-'+j+'"><strong>' +
            v.name +
            '</strong><div class="qa-order-inputs"><label class="field">주문 방식<select data-order-type aria-invalid="' + missing + '">' +
            (missing ? '<option value="">선택해 주세요</option>' : "") +
            types
              .map(
                (t) =>
                  "<option " +
                  (!missing && t === types[(i + j) % 4] ? "selected" : "") +
                  ">" +
                  t +
                  "</option>",
              )
              .join("") +
            '</select></label>' +
            U.field('회당 수량','quantity-'+i+'-'+j,'0',{type:'number',min:1,maximum:100000,step:1,mode:'numeric',value:(j+1)*20,suffix:'판'}) +
            '</div><button type="button" class="qf-remove" data-qa-action="unlink-venue">연결 해제</button></div>',
        )
        .join("") +
      (missing
        ? '<p class="qa-field-error" data-order-error>주문 방식을 선택해 주세요.</p>'
        : "") +
      "</div></article>"
    );
  }
  function q4Render(state, options) {
    return (
      '<div class="qa-quote" data-module="q4" data-state="' +
      state +
      '">' +
      quoteHead(options) +
      summaryBlock("계란 규격", "q1") +
      summaryBlock("현재 구매량과 가격", "q2") +
      summaryBlock("납품받을 사업장", "q3") +
      '<section class="qa-question">' +
      sectionHead("주문 방식", state !== "missing", true) +
      '<div class="qa-order-list">' +
      itemSeeds
        .map((v, i) =>
          q4Row(
            v,
            i,
            state !== "closed" && (i === 0 || (state === "mixed" && i === 1)),
            state === "missing" && i === 0,
          ),
        )
        .join("") +
      "</div>" +
      btn("주문 방식 완료", "finish-q4", true) +
      "</section>" +
      quoteFooter() +
      "</div>"
    );
  }
  function q4Mount(root, state, api, registerAction) {
    root = quoteScope(root);
    const validQuantity = (input) => {
      const n = Number(input.value);
      return (
        input.validity.valid && Number.isSafeInteger(n) && n >= 1 && n <= 100000
      );
    };
    const actOn = (target) => {
      const b = target.closest("[data-qa-action]");
      if (!b) return;
      const a = b.dataset.qaAction;
      if (a === "toggle-question") toggleQuestion(b);
      else if (a === "toggle-row") {
        const on = b.getAttribute("aria-expanded") === "true";
        b.setAttribute("aria-expanded", String(!on));
        root.querySelector("#" + b.getAttribute("aria-controls")).hidden = on;
      } else if(a==="unlink-venue"){
        const entry=b.closest('.qa-order-venue'), product=entry.closest('.qa-order-row');
        entry.remove();
        const sites=product.querySelectorAll('.qa-order-venue').length;
        if(!sites)product.remove();
        else {product.querySelector('[data-order-venue-count]').textContent=sites+'개 사업장';product.querySelector('select')?.dispatchEvent(new Event('change',{bubbles:true}));}
        root.querySelector('[data-qa-action="finish-q4"]').hidden=!root.querySelector('.qa-order-venue');
      } else if (a === "finish-q4" || a === "review") {
        const invalid =
          [...root.querySelectorAll("select")].find((s) => !s.value) ||
          [...root.querySelectorAll("input[type=number]")].find(
            (s) => !validQuantity(s),
          );
        if (invalid) {
          const panel = invalid.closest(".qa-order-panel");
          panel.hidden = false;
          panel.previousElementSibling.setAttribute("aria-expanded", "true");
          invalid.focus();
          U.setFieldError(invalid,"주문 방식과 수량을 확인해 주세요.");U.shake(invalid.closest(".field"));
          return;
        }
        success(api, b);
        select(api,"quote-review","normal");
      } else if (a === "route")
        select(
          api,
          b.dataset.target,
          b.dataset.target === "q1" ? "selected" : b.dataset.target === "q2" ? "empty" : "closed",
        );
      else if (a === "back") select(api, "q3", "open");
      else if (a === "reset") select(api, "q4", "missing");
      else if (a === "draft") {
        success(api, b);
        select(api,"quote-review","saved");
      }
    };
    const change = (e) => {
      const row = e.target.closest(".qa-order-row");
      if (!row) return;
      const types = [...row.querySelectorAll("select")].map((s) => s.value);
      row.querySelector("[data-order-summary]").textContent = types.some(
        (t) => !t,
      )
        ? "주문 방식 입력 전"
        : new Set(types).size === 1
          ? types[0]
          : "혼합 주문";
      const error = row.querySelector("[data-order-error]");
      if (error) error.hidden = types.every(Boolean);
      U.setFieldError(e.target,e.target.tagName==="SELECT"?e.target.value?"":"주문 방식을 선택해 주세요.":validQuantity(e.target)?"":"회당 수량을 확인해 주세요.");
      setQuestionDone(
        root,
        [...root.querySelectorAll("select")].every((el) => !!el.value) &&
          [...root.querySelectorAll('input[type="number"]')].every(
            validQuantity,
          ),
      );
    };
    registerAction(actOn);
    const click=(e)=>actOn(e.target);
    root.addEventListener("click", click);
    root.addEventListener("change", change);
    return () => {
      root.removeEventListener("click", click);
      root.removeEventListener("change", change);
    };
  }
  function mountQuestions(original){
    return (surface,state,api)=>{
      const root=quoteScope(surface);
      let actOn;
      const unmount=original(surface,state,api,handle=>{actOn=handle;});
      const actionSelector='[data-qa-action="remove-item"],[data-qa-action="delete-venue"],[data-qa-action="detach-item"],[data-qa-action="unlink-venue"]';
      let confirmation=null, gesture=null, suppress=null;
      const items='.qa-item-row,.qa-assigned-item,.qa-order-venue,.qa-venue-row,.qa-order-row';
      const on=(type,handler)=>root.addEventListener(type,handler,true);
      const off=(type,handler)=>root.removeEventListener(type,handler,true);
      function candidate(row){
        return [...row.querySelectorAll(actionSelector)].find(b=>b.closest(items)===row);
      }
      function dismiss(focus=true){if(!confirmation)return;const prior=confirmation;confirmation=null;prior.dialog.remove();if(focus&&prior.button.isConnected)prior.button.focus({preventScroll:true});}
      function request(button){
        if(confirmation)return;
        const kind=button.dataset.qaAction;
        const unlink=['detach-item','unlink-venue'].includes(kind);
        const row=button.closest(items),name=row?.querySelector('strong')?.textContent||'';
        const overlay=document.createElement('div');overlay.className='qa-modal-backdrop';overlay.dataset.qfConfirm='';
        const dialog=document.createElement('section');dialog.className='qa-mini-modal';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','qf-confirm-title');
        const title=document.createElement('h2');title.id='qf-confirm-title';title.textContent=unlink?'연결을 해제할까요?':'목록에서 삭제할까요?';
        const product=row?.closest('.qa-order-row');
        const parentName=product?.querySelector('.qa-disclosure strong')?.textContent;
        overlay.dataset.subject=row?.id||row?.dataset.venue||'';
        const text=document.createElement('p');text.textContent=parentName?parentName+' · '+name:name;
        const footer=document.createElement('footer'),cancel=document.createElement('button'),ok=document.createElement('button');
        cancel.type=ok.type='button';cancel.textContent='취소';ok.textContent=unlink?'해제':'삭제';
        // Touch browsers can suppress the compatibility click on the tap following a drag.
        // A deliberate stationary release on the same control may activate it; a cancelled drag never does.
        function bindControl(control,run){
          let touch=null,timer=null,discardTouchClick=false;
          const activate=()=>{
            clearTimeout(timer);
            if(confirmation?.dialog===overlay)run();
          };
          control.onclick=e=>{if(!discardTouchClick||e.detail===0)activate();};
          control.onpointerdown=e=>{
            clearTimeout(timer);touch=null;discardTouchClick=false;
            if(e.pointerType==='touch'&&e.isPrimary&&e.button===0){
              touch={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
              control.setPointerCapture(e.pointerId);
            }
          };
          control.onpointermove=e=>{
            if(touch?.id===e.pointerId&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>8){touch.moved=true;discardTouchClick=true;}
          };
          control.onpointercancel=()=>{touch=null;discardTouchClick=true;clearTimeout(timer);};
          control.onpointerup=e=>{
            const start=touch;touch=null;
            if(!start||start.id!==e.pointerId||start.moved||Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)return;
            const over=document.elementFromPoint(e.clientX,e.clientY);
            if(over&&control.contains(over))timer=setTimeout(activate,320);
          };
        }
        bindControl(cancel,()=>dismiss());
        bindControl(ok,()=>{dismiss(false);if(row?.isConnected&&row.contains(button))actOn(button);
          const next=root.querySelector('.qf-main,.qa-disclosure,[data-qa-action="add-item"],[data-qa-action="add-venue"]');
          next?.focus({preventScroll:true});});
        footer.append(cancel,ok);dialog.append(title,text,footer);overlay.append(dialog);root.append(overlay);
        confirmation={dialog:overlay,button};cancel.focus({preventScroll:true});
      }
      function click(e){
        if(confirmation&&confirmation.dialog.contains(e.target))return;
        const button=e.target.closest('button');
        if(!button)return;
        if(suppress&&e.detail&&suppress.row.contains(button)&&performance.now()<suppress.until){e.preventDefault();e.stopImmediatePropagation();return;}
        if(button.matches(actionSelector)){e.preventDefault();e.stopImmediatePropagation();request(button);}
      }
      function key(e){
        if(confirmation){
          if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dismiss();return;}
          if(e.key==='Tab'){const controls=confirmation.dialog.querySelectorAll('button');e.preventDefault();e.stopImmediatePropagation();(document.activeElement===controls[0]?controls[1]:controls[0]).focus();}
          return;
        }
        if(e.key!=='Delete'||e.target.closest('input,select,textarea'))return;
        const row=e.target.closest(items);if(!row)return;
        const b=candidate(row);if(b){e.preventDefault();e.stopImmediatePropagation();request(b);}
      }
      function down(e){
        if(confirmation||!e.isPrimary||e.button!==0||e.target.closest('input,select,textarea'))return;
        const row=e.target.closest(items);if(!row)return;
        gesture={row,id:e.pointerId,x:e.clientX,y:e.clientY};
      }
      function up(e){
        const start=gesture;gesture=null;if(!start||start.id!==e.pointerId)return;
        const x=start.x-e.clientX,y=Math.abs(start.y-e.clientY);
        if(x<56||x<2*y)return;
        const b=candidate(start.row);
        if(!b&&start.row.matches('.qa-order-row')){
          const head=start.row.querySelector('.qa-disclosure');if(head.getAttribute('aria-expanded')==='false')head.click();
          start.row.querySelector('[data-qa-action="unlink-venue"]')?.focus();return;
        }
        if(!b)return;suppress={row:start.row,until:performance.now()+500};request(b);
      }
      const cancel=()=>{gesture=null;};
      on('click',click);on('keydown',key);on('pointerdown',down);on('pointerup',up);on('pointercancel',cancel);
      return ()=>{dismiss(false);off('click',click);off('keydown',key);off('pointerdown',down);off('pointerup',up);off('pointercancel',cancel);unmount?.();};
    };
  }
  window.ORDER_DESIGN_MODULES.push(
    {
      id: "q1",
      group: "견적 작성",
      label: "Q1 계란 규격",
      description: "규격 목록과 미니 편집 팝업을 비교합니다.",
      width: "mobile",
      states: [
        { id: "before", label: "선택 전" },
        { id: "selected", label: "선택 후" },
        { id: "edit", label: "규격 편집" },
        { id: "error", label: "입력 오류" },
      ],
      render: q1Render,
      mount: mountQuestions(q1Mount),
    },
    {
      id: "q3",
      group: "견적 작성",
      label: "Q3 납품받을 사업장",
      description: "사업장과 품목을 내부 테두리 없이 행으로 정리합니다.",
      width: "mobile",
      states: [
        { id: "closed", label: "사업장 닫힘" },
        { id: "open", label: "사업장 열림" },
        { id: "incomplete", label: "미완료" },
        { id: "long-name", label: "긴 사업장 이름" },
      ],
      render: q3Render,
      mount: mountQuestions(q3Mount),
    },
    {
      id: "q4",
      group: "견적 작성",
      label: "Q4 주문 방식",
      description: "품목별 사업장과 주문 방식을 같은 행 구조로 확인합니다.",
      width: "mobile",
      states: [
        { id: "closed", label: "모두 닫힘" },
        { id: "open", label: "첫 품목 열림" },
        { id: "mixed", label: "혼합 주문" },
        { id: "missing", label: "입력 누락" },
      ],
      render: q4Render,
      mount: mountQuestions(q4Mount),
    },
  );
})();
