export function renderPreviewIndex(){
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order. 비공개 IA</title><style>
*{box-sizing:border-box}body{margin:0;color:#192333;background:#f6f7f9;font:16px/1.55 system-ui,sans-serif}
main{max-width:46rem;margin:auto;padding:clamp(2rem,8vw,5rem) 1.25rem}h1{font-size:clamp(2rem,5vw,3rem);line-height:1.2;margin:0 0 1.5rem}
nav{display:grid;gap:.65rem}a{padding:1rem 1.25rem;border:1px solid #d4dae1;border-radius:.65rem;background:white;color:#15385f;text-decoration:none;font-weight:650}
a:hover,a:focus-visible{outline:2px solid #336ab0}small{font-weight:400;color:#495565;margin-inline-start:.5rem}
</style><main><h1>Order. 비공개 IA</h1><nav aria-label="R3 작업 공간">
<a href="/ia?view=qa-lab" target="_blank" rel="noopener">QA 랩 <small>새 창에서 열기</small></a>
<details><summary>새 창이 열리지 않을 때</summary><a href="/ia?view=qa-lab">이 탭에서 QA 랩 열기</a></details>
<a href="/ia?view=simple-r3">간편 견적</a><a href="/ia?view=detailed-r3">상세 견적</a>
<a href="/ia?view=roles-r3">역할별 업무</a><a href="/ia?view=pricing-r3">가격·배송비</a></nav></main></html>`;
}
