import { createBrowserClient } from '@supabase/ssr';

const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
};

const supabase = createClient();

export default supabase;
