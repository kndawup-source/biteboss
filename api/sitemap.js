const SUPABASE_URL=process.env.SUPABASE_URL || "https://imumpyumchvctrpmfngr.supabase.co";
const KEY=process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const esc=v=>String(v??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
const autoSlug=id=>`store-${String(id||"").replace(/-/g,"").slice(0,8).toLowerCase()}`;
export default async function handler(req,res){
  if(!KEY) return res.status(500).send("Missing configuration");
  const url=`${SUPABASE_URL}/rest/v1/biteboss_stores?select=id,name,updated_at&status=eq.active&partnership_status=eq.partnered&order=updated_at.desc`;
  const r=await fetch(url,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});
  if(!r.ok) return res.status(500).send("Sitemap unavailable");
  const rows=await r.json();
  const enriched=await Promise.all(rows.map(async x=>{
    try{
      const sr=await fetch(`${SUPABASE_URL}/rest/v1/rpc/biteboss_store_seo_settings`,{method:"POST",headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,"Content-Type":"application/json"},body:JSON.stringify({p_store_id:x.id})});
      const seo=sr.ok ? await sr.json() : null;
      return {...x,slug:String(seo?.slug || autoSlug(x.id))};
    }catch{return {...x,slug:autoSlug(x.id)};}
  }));
  const items=enriched.map(x=>`<url><loc>${esc(`https://biteboss.kr/store/${encodeURIComponent(x.id)}/${encodeURIComponent(x.slug)}`)}</loc>${x.updated_at?`<lastmod>${esc(new Date(x.updated_at).toISOString())}</lastmod>`:""}</url>`).join("");
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`);
}
