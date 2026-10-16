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
    // Discovery is cell/TTL based, never store-count based.
    // A populated BiteBoss area can still contain Kakao places that have
    // never been imported, so an existing-store threshold must not block
    // discovery. The cell cache alone prevents repeated API work.
    const existingNearby = await getExistingNearbyStores(env, lat, lng, radius);
    const existingCount = Array.isArray(existingNearby) ? existingNearby.length : 0;
    const recent = await getRecentSync(env, cellKey);

    if(recent){
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
      const existingIdentities = await getStoreIdentityRows(
        env,
        existingNearby.map(store => store?.id).filter(Boolean)
      );
      const { linked, remaining } = planStoreReconciliation(rows, existingIdentities);

      const linkFallbackRows = linked.length
        ? await linkManualStores(env, linked)
        : [];
      const rowsToUpsert = [...remaining, ...linkFallbackRows];
      if(rowsToUpsert.length){
        await upsertStores(env, rowsToUpsert);
      }
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

function normalizeMatchText(value){
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function distanceMeters(a, b){
  const lat1 = Number(a?.latitude);
  const lng1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lng2 = Number(b?.longitude);
  if(![lat1,lng1,lat2,lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const rad = value => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function commonPrefixLength(a, b){
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while(index < limit && a[index] === b[index]) index += 1;
  return index;
}

function manualMatchScore(incoming, existing){
  if(String(existing?.provider_place_id || "").trim()) return null;
  if(String(existing?.status || "active") !== "active") return null;
  if(existing?.category && incoming?.category && String(existing.category) !== String(incoming.category)) return null;

  const meters = distanceMeters(incoming, existing);
  if(!Number.isFinite(meters) || meters > 80) return null;

  const incomingName = normalizeMatchText(incoming?.name);
  const existingName = normalizeMatchText(existing?.name);
  const incomingAddress = normalizeMatchText(incoming?.address);
  const existingAddress = normalizeMatchText(existing?.address);
  if(!incomingName || !existingName) return null;

  if(incomingAddress && existingAddress && incomingAddress === existingAddress){
    return meters;
  }
  if(incomingName === existingName && meters <= 60){
    return 100 + meters;
  }

  const shorter = incomingName.length <= existingName.length ? incomingName : existingName;
  const longer = shorter === incomingName ? existingName : incomingName;
  if(shorter.length >= 3 && longer.includes(shorter) && meters <= 35){
    return 200 + meters;
  }
  if(commonPrefixLength(incomingName, existingName) >= 3 && meters <= 25){
    return 300 + meters;
  }
  return null;
}

function planStoreReconciliation(rows, existingStores){
  const incomingRows = Array.isArray(rows) ? rows : [];
  const existing = Array.isArray(existingStores) ? existingStores : [];
  const exactProviderIds = new Set(
    existing
      .filter(store => String(store?.provider || "") === "kakao" && String(store?.provider_place_id || "").trim())
      .map(store => String(store.provider_place_id))
  );
  const manualStores = existing.filter(store => !String(store?.provider_place_id || "").trim());
  const proposals = [];

  incomingRows.forEach((row, rowIndex) => {
    if(exactProviderIds.has(String(row?.provider_place_id || ""))) return;
    manualStores.forEach(store => {
      const score = manualMatchScore(row, store);
      if(score !== null){
        proposals.push({ rowIndex, storeId:String(store.id), score, row, store });
      }
    });
  });

  proposals.sort((a,b) => a.score - b.score);
  const usedRows = new Set();
  const usedStores = new Set();
  const linked = [];

  proposals.forEach(match => {
    if(usedRows.has(match.rowIndex) || usedStores.has(match.storeId)) return;
    usedRows.add(match.rowIndex);
    usedStores.add(match.storeId);
    linked.push(match);
  });

  return {
    linked,
    remaining:incomingRows.filter((_, index) => !usedRows.has(index))
  };
}

async function getStoreIdentityRows(env, ids){
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if(!uniqueIds.length) return [];

  const rows = [];
  for(let offset = 0; offset < uniqueIds.length; offset += 100){
    const chunk = uniqueIds.slice(offset, offset + 100);
    const query = new URLSearchParams({
      select:"id,name,category,city,district,address,latitude,longitude,status,provider,provider_place_id,auto_imported",
      id:`in.(${chunk.join(",")})`
    });
    const response = await supabaseFetch(env, `/rest/v1/biteboss_stores?${query.toString()}`, { method:"GET" });
    if(!response.ok){
      throw new Error(`SUPABASE_STORE_IDENTITY_${response.status}:${await response.text()}`);
    }
    const page = await response.json();
    if(Array.isArray(page)) rows.push(...page);
  }
  return rows;
}

async function linkManualStores(env, matches){
  const fallbackRows = [];

  for(const match of matches){
    const row = match.row;
    const query = new URLSearchParams({
      id:`eq.${match.storeId}`,
      provider_place_id:"is.null"
    });
    const response = await supabaseFetch(env, `/rest/v1/biteboss_stores?${query.toString()}`, {
      method:"PATCH",
      headers:{
        "Prefer":"return=representation",
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        name:row.name,
        category:row.category,
        city:row.city,
        district:row.district,
        address:row.address,
        latitude:row.latitude,
        longitude:row.longitude,
        phone:row.phone,
        provider:row.provider,
        provider_place_id:row.provider_place_id,
        source_url:row.source_url,
        updated_at:new Date().toISOString()
      })
    });
    if(!response.ok){
      throw new Error(`SUPABASE_STORE_LINK_${response.status}:${await response.text()}`);
    }

    const updated = await response.json();
    if(!Array.isArray(updated) || updated.length === 0){
      fallbackRows.push(row);
    }
  }

  return fallbackRows;
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
module.exports.__test = {
  numberInRange,
  integerInRange,
  makeCellKey,
  normalizePlaces,
  normalizeMatchText,
  distanceMeters,
  manualMatchScore,
  planStoreReconciliation
};
