// Geocodificação (endereço → coordenadas) via Nominatim, o serviço de busca do OpenStreetMap.
// Política de uso: no máximo 1 requisição/s e sem autocompletar a cada tecla,
// por isso a busca só é disparada quando o usuário envia o formulário.
// https://operations.osmfoundation.org/policies/nominatim/

export interface ResultadoGeocodificacao {
  id: number;
  nome: string; // display_name completo do OSM
  lat: number; // graus, EPSG:4326
  lng: number;
}

// Retângulo envolvente do município de Londrina (oeste, norte, leste, sul) em graus.
// Com bounded=1 o Nominatim só devolve resultados dentro dele.
const VIEWBOX_LONDRINA = '-51.35,-23.18,-50.93,-23.68';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export async function buscarEndereco(
  consulta: string,
  signal?: AbortSignal
): Promise<ResultadoGeocodificacao[]> {
  const termo = consulta.trim();
  if (termo.length < 3) return [];

  const params = new URLSearchParams({
    q: termo,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'br',
    viewbox: VIEWBOX_LONDRINA,
    bounded: '1',
    'accept-language': 'pt-BR',
  });

  const res = await fetch(`${NOMINATIM_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);

  const dados: Array<{ place_id: number; display_name: string; lat: string; lon: string }> =
    await res.json();

  return dados.map((d) => ({
    id: d.place_id,
    nome: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}
