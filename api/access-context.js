const clean = (value, max = 80) => String(value || "").trim().slice(0, max);

export default function handler(req, res){
  // Vercel resolves coarse geography from the request before this function runs.
  // BiteBoss intentionally does not read, return, log, or persist the client IP.
  const country = clean(req.headers["x-vercel-ip-country"], 2).toUpperCase();
  const region = clean(req.headers["x-vercel-ip-country-region"], 32).toUpperCase();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json({
    country_code: /^[A-Z]{2}$/.test(country) ? country : "",
    region_code: region
  });
}
