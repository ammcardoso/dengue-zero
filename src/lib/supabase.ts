import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Foco {
  id: string;
  tipo: 'agua_parada' | 'lixo' | 'caixa_dagua' | 'outro';
  descricao?: string;
  foto_url?: string;
  lat: number;
  lng: number;
  bairro: string;
  semana_epi: number;
  criado_em: string;
  offline?: boolean;
}