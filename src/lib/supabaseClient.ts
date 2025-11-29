// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  // Geliştirme sırasında env eksikse terminalde görmek için:
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env'leri eksik: NEXT_PUBLIC_SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
