import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://lroyrrgcjjtijwutykzm.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb3lycmdjamp0aWp3dXR5a3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDgxNzAsImV4cCI6MjExMTAyNDE3MH0.tX3sQLLbY0myA3-9UUxfCtgReCn3k32e870fTT7Q0uE';

export const STORAGE_BUCKET = 'yole-products';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
