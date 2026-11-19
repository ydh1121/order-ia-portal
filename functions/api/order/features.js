export async function onRequest({request,env}) {
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD'}});
  let enabled=false;
  try{const state=await env.ORDER_QA_DB?.prepare('SELECT enabled FROM r3_menu_publication ORDER BY revision DESC LIMIT 1').first();enabled=state?.enabled===1;}catch{/* Unprovisioned publication defaults to off. */}
  return new Response(request.method==='HEAD'?null:JSON.stringify({orderMenu:enabled}),{headers});
}
