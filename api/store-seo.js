const SUPABASE_URL = process.env.SUPABASE_URL || "https://imumpyumchvctrpmfngr.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const json = value => JSON.stringify(value).replace(/</g,"\\u003c");
const autoSlug = id => `store-${String(id || "").replace(/-/g,"").slice(0,8).toLowerCase()}`;

async function rpc(name, body){
  if(!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY_MISSING");
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${SUPABASE_ANON_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if(!response.ok) throw new Error(`${name}:${response.status}`);
  return response.json();
}

function page({store,photos=[],video={},seo={}}){
  const name=String(store.name || "매장");
  const publicSlug=String(seo?.slug || autoSlug(store.id));
  const canonical=`https://biteboss.dasaft.com/store/${encodeURIComponent(publicSlug)}`;
  const place=[store.city,store.district].filter(Boolean).join(" ");
  const description=[place,store.category,store.notice].filter(Boolean).join(" · ").slice(0,155) || `${name}의 BiteBoss 매장 정보입니다.`;
  const cover=(photos.find(p=>p?.is_cover) || photos[0] || {}).image_url || "";
  const address=String(store.address || "");
  const phone=String(store.phone || "");
  const hours=String(store.hours || "").split("|")[0].trim();
  const structured={
    "@context":"https://schema.org",
    "@type":String(store.category || "").toLowerCase().includes("restaurant") ? "Restaurant" : "LocalBusiness",
    name,
    url:canonical,
    ...(cover?{image:[cover]}:{}),
    ...(address?{address:{"@type":"PostalAddress","streetAddress":address,"addressLocality":store.district || store.city || "","addressCountry":"KR"}}:{}),
    ...(phone?{telephone:phone}:{}),
    ...(store.latitude && store.longitude?{geo:{"@type":"GeoCoordinates","latitude":Number(store.latitude),"longitude":Number(store.longitude)}}:{})
  };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(name)} | BiteBoss</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="business.business"><meta property="og:title" content="${esc(name)} | BiteBoss"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">${cover?`<meta property="og:image" content="${esc(cover)}">`:""}<script type="application/ld+json">${json(structured)}</script><link rel="stylesheet" href="/styles.css?v=82.17"></head><body><main class="seo-store-shell"><article><h1>${esc(name)}</h1>${cover?`<img src="${esc(cover)}" alt="${esc(name)} 대표 이미지">`:""}<p>${esc([place,address].filter(Boolean).join(" · "))}</p>${hours?`<p>영업시간 ${esc(hours)}</p>`:""}${phone?`<p>전화 ${esc(phone)}</p>`:""}<p>${esc(store.notice || "")}</p><a href="${esc(canonical)}?app=1">BiteBoss에서 매장 보기</a></article></main></body></html>`;
}

export default async function handler(req,res){
  try{
    const id=String(req.query?.id || "").trim();
    const requestedSlug=String(req.query?.slug || "").trim().toLowerCase();

    let storeId=id;
    let seo=null;
    if(!storeId){
      const resolved=await rpc("biteboss_store_resolve_slug",{p_slug:requestedSlug});
      if(!resolved?.store_id) return res.status(404).send("Not found");
      storeId=String(resolved.store_id);
      seo={slug:String(resolved.slug || requestedSlug)};
    }
    if(!/^[0-9a-f-]{36}$/i.test(storeId)) return res.status(404).send("Not found");

    seo=seo || await rpc("biteboss_store_seo_settings",{p_store_id:storeId});
    const canonicalSlug=String(seo?.slug || autoSlug(storeId));

    // Legacy UUID URLs permanently converge on the clean public URL.
    if(id) return res.redirect(308,`/store/${encodeURIComponent(canonicalSlug)}`);
    if(requestedSlug!==canonicalSlug) return res.redirect(308,`/store/${encodeURIComponent(canonicalSlug)}`);

    // Serve the real BiteBoss app shell. The client reads /store/:slug,
    // resolves it to the store UUID, then calls the same openStoreDetail()
    // used when a store is opened from the store list.
    const origin=`${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const shellResponse=await fetch(`${origin}/index.html`,{headers:{"user-agent":"BiteBoss-Store-Shell/1.0"}});
    if(!shellResponse.ok) return res.status(500).send("App unavailable");
    let shell=await shellResponse.text();

    // Keep direct store URLs indexable without creating a second visual page.
    // Metadata is injected into the same app shell only.
    try{
      const detail=await rpc("biteboss_store_detail",{p_store_id:storeId});
      const store=detail?.store || null;
      if(store){
        const name=String(store.name || "매장");
        const place=[store.city,store.district].filter(Boolean).join(" ");
        const description=([place,store.category,store.notice].filter(Boolean).join(" · ").slice(0,155) || `${name}의 BiteBoss 매장 정보입니다.`);
        const canonical=`https://biteboss.dasaft.com/store/${encodeURIComponent(canonicalSlug)}`;
        const cover=((Array.isArray(detail.photos)?detail.photos:[]).find(x=>x?.is_cover) || (Array.isArray(detail.photos)?detail.photos:[])[0] || {}).image_url || "";
        shell=shell
          .replace(/<title>[^<]*<\/title>/i,`<title>${esc(name)} | BiteBoss</title>`)
          .replace(/<meta name="description" content="[^"]*"\s*\/?>/i,`<meta name="description" content="${esc(description)}" />`)
          .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i,`<link rel="canonical" href="${esc(canonical)}" />`)
          .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/i,`<meta property="og:title" content="${esc(name)} | BiteBoss" />`)
          .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/i,`<meta property="og:description" content="${esc(description)}" />`);
        if(cover && !/property="og:image"/i.test(shell)){
          shell=shell.replace('</head>',`  <meta property="og:image" content="${esc(cover)}" />\n</head>`);
        }
      }
    }catch(metaError){
      console.warn("BiteBoss store metadata:",metaError);
    }

    res.setHeader("Cache-Control","public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).send(shell);
  }catch(error){
    console.error(error);
    return res.status(500).send("Store page unavailable");
  }
}
