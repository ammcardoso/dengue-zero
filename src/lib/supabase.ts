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

export interface FocoProximo extends Foco {
  distancia_metros: number;
}

// Consulta espacial no PostGIS (RPC focos_proximos): ST_DWithin sobre GEOGRAPHY,
// com índice GIST e distância geodésica em metros, ordenada da mais próxima.
export async function buscarFocosProximos(
  lat: number,
  lng: number,
  raioMetros: number
): Promise<FocoProximo[]> {
  const { data, error } = await supabase.rpc('focos_proximos', {
    user_lat: lat,
    user_lng: lng,
    raio_metros: raioMetros,
  });
  if (error) throw error;
  return (data ?? []) as FocoProximo[];
}