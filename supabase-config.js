/* ================================================================
   CONFIGURAÇÃO DO SUPABASE
   ================================================================
   Cole aqui a URL e a "anon key" do seu projeto Supabase.
   Você encontra os dois em: Project Settings → API, no painel
   do Supabase (https://supabase.com/dashboard).

   A "anon key" é segura para ficar exposta no código do navegador
   — ela só permite o que as políticas de Row Level Security (RLS)
   autorizarem, e o schema já vem com RLS configurado para que cada
   pessoa só acesse os próprios dados.
   ================================================================ */

const SUPABASE_URL = "https://jkkzknmdrvbstouekosi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_m7IOOA53WnXlhKDvW1C3xA_Ch3OQoRE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
