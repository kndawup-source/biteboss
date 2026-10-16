const SUPABASE_URL="https://imumpyumchvctrpmfngr.supabase.co";
const ANON=process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImltdW1weXVtY2h2Y3RycG1mbmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODQ1MjksImV4cCI6MjA5OTc2MDUyOX0.oXpNENBuoaN9cTgQfiesRpQucsCS2XSDTr62M58ue7Y";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
module.exports=async(req,res)=>{
  const id=String(req.query.id||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).send("Not found");
  const r=await fetch(`${SUPABASE_URL}/rest/v1/biteboss_stores?id=eq.${encodeURIComponent(id)}&status=eq.active&select=id,name,category,city,district,address,created_at&limit=1`,{headers:{apikey:ANON,Authorization:`Bearer ${ANON}`}});
  const rows=r.ok?await r.json():[]; const store=rows[0];
  if(!store) return res.status(404).send("Not found");
  const origin=`https://${req.headers.host}`; const canonical=`${origin}/store/${store.id}/${encodeURIComponent(String(store.name||"store").replace(/\s+/g,"-"))}`;
  const location=[store.city,store.district].filter(Boolean).join(" ");
  const title=`${store.name}${location?` - ${location}`:""} | BiteBoss`;
  const description=`${location?location+" ":""}${store.name}의 매장 정보와 BiteBoss 방문·점령 현황을 확인하세요.`;
  const ld={"@context":"https://schema.org","@type":"LocalBusiness","@id":canonical,"name":store.name,"url":canonical,"address":{"@type":"PostalAddress","streetAddress":store.address||"","addressLocality":store.district||store.city||"","addressRegion":store.city||"","addressCountry":"KR"}};
  res.setHeader("Content-Type","text/html; charset=utf-8"); res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="business.business"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g,"\\u003c")}</script></head><body><main><p>BITEBOSS / STORE</p><h1>${esc(store.name)}</h1><p>${esc([store.category,location,store.address].filter(Boolean).join(" · "))}</p><p>${esc(description)}</p><p><a href="/stores?store=${encodeURIComponent(store.id)}">BiteBoss에서 ${esc(store.name)} 보기</a></p></main></body></html>`);
};