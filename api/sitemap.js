const SUPABASE_URL=process.env.SUPABASE_URL || "https://imumpyumchvctrpmfngr.supabase.co";
const KEY=process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const esc=v=>String(v??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
const slug=v=>String(v||"").trim().normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,80)||"store";
export default async function handler(req,res){
  if(!KEY) return res.status(500).send("Missing configuration");
  const url=`${SUPABASE_URL}/rest/v1/biteboss_stores?select=id,name,updated_at&status=eq.active&partnership_status=eq.partnered&order=updated_at.desc`;
  const r=await fetch(url,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});
  if(!r.ok) return res.status(500).send("Sitemap unavailable");
  const rows=await r.json();
  const items=rows.map(x=>`<url><loc>${esc(`https://biteboss.kr/store/${encodeURIComponent(x.id)}/${encodeURIComponent(slug(x.name))}`)}</loc>${x.updated_at?`<lastmod>${esc(new Date(x.updated_at).toISOString())}</lastmod>`:""}</url>`).join("");
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`);
}
