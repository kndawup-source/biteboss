// Vercel Serverless Function
// GitHub path: /api/nearby-stores.js
//
// Required Vercel Environment Variables:
// KAKAO_REST_API_KEY
// SUPABASE_URL
// SUPABASE_ANON_KEY
// SUPABASE_SERVICE_ROLE_KEY
//
// The service-role key stays server-side only. Never place it in app-config.js.

const KAKAO_CATEGORY_CODES = ["FD6", "CE7"]; // restaurant, cafe

// Nearby discovery should react to movement.
// The previous 24h + ~1km cell cache could prevent a moved user
// from refreshing stores around the new GPS position.
const SYNC_TTL_MINUTES = 120;

// Kakao Local category search supports up to 15 results per page.
// Three pages gives up to 45 results per category and keeps
// server/API load bounded.
const KAKAO_PAGE_SIZE = 15;
const KAKAO_MAX_PAGES = 3;

// If the DB still has fewer than this many stores around the user,
// bypass the recent-sync cache and try Kakao again.
const MIN_NEARBY_STORE_COUNT = 10;

module.exports = async function handler(req, res){
  if(req.method !== "GET"){
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error:"METHOD_NOT_ALLOWED" });
  }

  res.setHeader("Cache-Control", "no-store");

  const env = readEnv();
  if(!env.ok){
    return res.status(500).json({
      error:"SERVER_CONFIG_MISSING",
      missing:env.missing
    });
  }

  const lat = numberInRange(req.query.lat, -90, 90);
  const lng = numberInRange(req.query.lng, -180, 180);
  const radius = integerInRange(req.query.radius ?? 1000, 300, 2000);

  if(lat === null || lng === null || radius === null){
    return res.status(400).json({ error:"INVALID_LOCATION" });
  }

  const token = readBearer(req.headers.authorization);
  if(!token){
    return res.status(401).json({ error:"AUTH_REQUIRED" });
  }

  const authUser = await verifySupabaseUser(env, token);
  if(!authUser){
    return res.status(401).json({ error:"INVALID_SESSION" });
  }

  const cellKey = makeCellKey(lat, lng, radius);

  try{
    // Read current DB state first.
    // This prevents a stale recent-sync record from keeping an
    // under-populated area permanently empty.
    const existingNearby = await getExistingNearbyStores(env, lat, lng, radius);
    const existingCount = Array.isArray(existingNearby) ? existingNearby.length : 0;

    const recent = await getRecentSync(env, cellKey);
    const canUseRecentCache =
      recent &&
      existingCount >= MIN_NEARBY_STORE_COUNT;

    if(canUseRecentCache){
      return res.status(200).json({
        ok:true,
        imported:0,
        discovered:0,
        existing:existingCount,
        skipped:true,
        reason:"RECENTLY_SYNCED",
        cell_key:cellKey
      });
    }

    const places = await fetchKakaoPlaces(env.kakaoKey, lat, lng, radius);
    const rows = normalizePlaces(places);

    if(rows.length){
      await upsertStores(env, rows);
    }

    // Read again after the upsert so the response reflects the DB
    // that the client will query immediately after this API returns.
    const refreshedNearby = await getExistingNearbyStores(env, lat, lng, radius);
    const refreshedCount = Array.isArray(refreshedNearby) ? refreshedNearby.length : 0;

    await markSynced(env, {
      cell_key:cellKey,
      provider:"kakao",
      latitude:lat,
      longitude:lng,
      radius_m:radius,
      imported_count:rows.length
    });

    return res.status(200).json({
      ok:true,
      imported:rows.length,
      discovered:places.length,
      existing:refreshedCount,
      skipped:false,
      cell_key:cellKey
    });
  }catch(error){
    console.error("BiteBoss nearby import:", error);

    return res.status(500).json({
      error:"AUTO_IMPORT_FAILED",
      message:String(error?.message || error)
    });
  }
};

function readEnv(){
  const values = {
    kakaoKey:process.env.KAKAO_REST_API_KEY,
    supabaseUrl:process.env.SUPABASE_URL,
    anonKey:process.env.SUPABASE_ANON_KEY,
    serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  const missing = Object.entries(values)
    .filter(([,value]) => !String(value || "").trim())
    .map(([key]) => key);

  return {
    ...values,
    missing,
    ok:missing.length === 0
  };
}

function readBearer(value){
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function numberInRange(value, min, max){
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function integerInRange(value, min, max){
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function makeCellKey(lat, lng, radius){
  // ~100 m grid in Korea instead of the previous ~1 km grid.
  // This matches the client-side movement refresh much better.
  return `kakao:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
}

async function verifySupabaseUser(env, token){
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers:{
      "apikey":env.anonKey,
      "Authorization":`Bearer ${token}`
    }
  });

  if(!response.ok) return null;
  return response.json();
}

async function getRecentSync(env, cellKey){
  const since = new Date(
    Date.now() - SYNC_TTL_MINUTES * 60 * 1000
  ).toISOString();

  const query = new URLSearchParams({
    select:"cell_key,last_synced_at",
    cell_key:`eq.${cellKey}`,
    last_synced_at:`gte.${since}`,
    limit:"1"
  });

  const response = await supabaseFetch(
    env,
    `/rest/v1/biteboss_place_import_cells?${query.toString()}`,
    { method:"GET" }
  );

  if(!response.ok){
    throw new Error(
      `SUPABASE_SYNC_READ_${response.status}:${await response.text()}`
    );
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function getExistingNearbyStores(env, lat, lng, radius){
  const response = await supabaseFetch(
    env,
    "/rest/v1/rpc/biteboss_nearby_stores_v631",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        p_lat:lat,
        p_lng:lng,
        p_radius_m:radius,
        p_limit:100
      })
    }
  );

  if(!response.ok){
    throw new Error(
      `SUPABASE_NEARBY_${response.status}:${await response.text()}`
    );
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchKakaoPlaces(kakaoKey, lat, lng, radius){
  const categoryResults = await Promise.all(
    KAKAO_CATEGORY_CODES.map(categoryCode =>
      fetchKakaoCategoryPages(
        kakaoKey,
        categoryCode,
        lat,
        lng,
        radius
      )
    )
  );

  const deduped = new Map();

  categoryResults.flat().forEach(place => {
    const id = String(place?.id || "").trim();
    if(id) deduped.set(id, place);
  });

  return [...deduped.values()];
}

async function fetchKakaoCategoryPages(
  kakaoKey,
  categoryCode,
  lat,
  lng,
  radius
){
  const collected = [];

  for(let page = 1; page <= KAKAO_MAX_PAGES; page += 1){
    const query = new URLSearchParams({
      category_group_code:categoryCode,
      x:String(lng),
      y:String(lat),
      radius:String(radius),
      size:String(KAKAO_PAGE_SIZE),
      page:String(page),
      sort:"distance"
    });

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/category.json?${query.toString()}`,
      {
        headers:{
          "Authorization":`KakaoAK ${kakaoKey}`,
          "Accept":"application/json"
        }
      }
    );

    if(!response.ok){
      throw new Error(`KAKAO_${categoryCode}_${response.status}`);
    }

    const payload = await response.json();
    const documents = Array.isArray(payload?.documents)
      ? payload.documents
      : [];

    collected.push(...documents);

    if(payload?.meta?.is_end === true || documents.length === 0){
      break;
    }
  }

  return collected;
}

function normalizePlaces(places){
  const deduped = new Map();

  places.forEach(place => {
    const providerPlaceId = String(place?.id || "").trim();
    const name = String(place?.place_name || "").trim();
    const address = String(
      place?.road_address_name ||
      place?.address_name ||
      ""
    ).trim();

    const latitude = Number(place?.y);
    const longitude = Number(place?.x);

    if(
      !providerPlaceId ||
      !name ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ){
      return;
    }

    const addressParts = String(place?.address_name || address)
      .split(/\s+/)
      .filter(Boolean);

    const categoryGroup = String(place?.category_group_code || "");
    const category = categoryGroup === "CE7"
      ? "cafe"
      : "restaurant";

    deduped.set(providerPlaceId, {
      name,
      brand_name:"",
      category,
      city:addressParts[0] || "",
      district:addressParts[1] || "",
      address,
      latitude,
      longitude,
      hours:"",
      phone:String(place?.phone || "").trim(),
      notice:"",
      photo_url:"",
      status:"active",
      partnership_status:"unclaimed",
      partnership_label:"",
      provider:"kakao",
      provider_place_id:providerPlaceId,
      source_url:String(place?.place_url || "").trim(),
      auto_imported:true,
      updated_at:new Date().toISOString()
    });
  });

  return [...deduped.values()];
}

async function upsertStores(env, rows){
  const response = await supabaseFetch(
    env,
    "/rest/v1/biteboss_stores?on_conflict=provider,provider_place_id",
    {
      method:"POST",
      headers:{
        "Prefer":"resolution=merge-duplicates,return=minimal",
        "Content-Type":"application/json"
      },
      body:JSON.stringify(rows)
    }
  );

  if(!response.ok){
    throw new Error(
      `SUPABASE_UPSERT_${response.status}:${await response.text()}`
    );
  }
}

async function markSynced(env, row){
  const response = await supabaseFetch(
    env,
    "/rest/v1/biteboss_place_import_cells?on_conflict=cell_key",
    {
      method:"POST",
      headers:{
        "Prefer":"resolution=merge-duplicates,return=minimal",
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        ...row,
        last_synced_at:new Date().toISOString()
      })
    }
  );

  if(!response.ok){
    throw new Error(
      `SUPABASE_SYNC_MARK_${response.status}:${await response.text()}`
    );
  }
}

async function supabaseFetch(env, path, options = {}){
  const headers = {
    "apikey":env.serviceRoleKey,
    "Authorization":`Bearer ${env.serviceRoleKey}`,
    ...(options.headers || {})
  };

  return fetch(`${env.supabaseUrl}${path}`, {
    ...options,
    headers
  });
}

// Pure helpers exposed only for local regression tests.
module.exports.__test = { numberInRange, integerInRange, makeCellKey, normalizePlaces };
