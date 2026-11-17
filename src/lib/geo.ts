import * as turf from '@turf/turf';
import { Foco } from './supabase';

// Calcula Semana Epidemiológica no formato AAAASE (ex: 202646)
export function getSemanaEpidemiologica(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() * 100 + weekNo;
}

// Operação Ponto-dentro-de-Polígono para identificar o bairro pelo GeoJSON do IBGE
export function identificarBairro(lat: number, lng: number, bairrosGeoJSON: any): string {
  if (!bairrosGeoJSON || !bairrosGeoJSON.features) return 'Não identificado';
  const pt = turf.point([lng, lat]);

  for (const feature of bairrosGeoJSON.features) {
    if (feature.geometry && turf.booleanPointInPolygon(pt, feature)) {
      // Ajustar propriedade conforme o shapefile do IBGE utilizado (ex: NM_BAIRRO ou nome)
      return feature.properties?.NM_BAIRRO || feature.properties?.nome || 'Bairro s/ nome';
    }
  }
  return 'Zona Rural / Fora da malha';
}

// Gera polígono de buffer de 200 metros (0.2 km)
export function gerarBuffer200m(lat: number, lng: number) {
  const pt = turf.point([lng, lat]);
  return turf.buffer(pt, 0.2, { units: 'kilometers' });
}

// Calcula distância em metros entre duas coordenadas
export function calcularDistanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const from = turf.point([lng1, lat1]);
  const to = turf.point([lng2, lat2]);
  return Math.round(turf.distance(from, to, { units: 'meters' }));
}

// Peso do foco para intensidade do Heatmap
export function getPesoFoco(tipo: Foco['tipo']): number {
  const pesos: Record<Foco['tipo'], number> = {
    agua_parada: 1.0,
    caixa_dagua: 0.9,
    lixo: 0.7,
    outro: 0.5,
  };
  return pesos[tipo] || 0.5;
}

// Converte lista de focos em FeatureCollection GeoJSON para download
export function exportarParaGeoJSON(focos: Foco[]): string {
  const features = focos.map((f) =>
    turf.point([f.lng, f.lat], {
      id: f.id,
      tipo: f.tipo,
      descricao: f.descricao || '',
      bairro: f.bairro,
      semana_epi: f.semana_epi,
      criado_em: f.criado_em,
      foto_url: f.foto_url || '',
    })
  );
  return JSON.stringify(turf.featureCollection(features), null, 2);
}