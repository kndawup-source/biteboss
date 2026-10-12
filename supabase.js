(function bootstrapBiteBossSupabase(){
  const cfg = window.BITEBOSS_CONFIG || {};

  if(!window.supabase?.createClient){
    window.sb = null;
    window.BITEBOSS_BOOT_ERROR = "Supabase library failed to load.";
    return;
  }

  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey){
    window.sb = null;
    window.BITEBOSS_BOOT_ERROR = "BiteBoss Supabase configuration is missing.";
    return;
  }

  window.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:(location.protocol === "https:" || location.protocol === "http:"),
      storageKey:"biteboss-auth"
    },
    global:{
      headers:{ "x-client-info":"biteboss/2.6" }
    }
  });
})();
