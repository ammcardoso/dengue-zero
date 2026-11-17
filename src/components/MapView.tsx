'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Foco, buscarFocosProximos } from '@/lib/supabase';
import { gerarBuffer200m, calcularDistanciaMetros, contarFocosNoRaio, identificarBairro } from '@/lib/geo';
import type { ResultadoGeocodificacao } from '@/lib/geocoding';

interface MapViewProps {
  focos: Foco[];
  mostrarHeatmap: boolean;
  mostrarBuffers: boolean;
  mostrarMarcadores: boolean;
  userLocation: { lat: number; lng: number } | null;
  bairrosGeoJSON?: any;
  localBuscado?: ResultadoGeocodificacao | null;
}

const RAIO_BUSCA_METROS = 200;

const LABELS_TIPO: Record<Foco['tipo'], string> = {
  agua_parada: '💧 Água parada',
  lixo: '🗑️ Lixo acumulado',
  caixa_dagua: '🛢️ Caixa d\'água aberta',
  outro: '⚠️ Outro criadouro',
};

// Os focos vêm de inserções públicas: escapar antes de montar o HTML do popup
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Ícone do agrupamento: vermelho, ou âmbar se todos os focos agrupados estão pendentes (offline)
function criarIconeCluster(cluster: L.MarkerCluster): L.DivIcon {
  const filhos = cluster.getAllChildMarkers();
  const todosOffline = filhos.every((m) => (m.options as { offline?: boolean }).offline);
  const total = cluster.getChildCount();
  const tamanho = total < 10 ? 30 : total < 100 ? 36 : 42;
  return L.divIcon({
    html: `<div style="width:${tamanho}px;height:${tamanho}px;line-height:${tamanho - 4}px;background:${
      todosOffline ? '#f59e0b' : '#dc2626'
    };color:#fff;border:2px solid #fff;border-radius:9999px;text-align:center;font:700 12px/${
      tamanho - 4
    }px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35)">${total}</div>`,
    className: '',
    iconSize: L.point(tamanho, tamanho),
  });
}

export default function MapView({
  focos,
  mostrarHeatmap,
  mostrarBuffers,
  mostrarMarcadores,
  userLocation,
  bairrosGeoJSON,
  localBuscado,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    markers: L.MarkerClusterGroup;
    buffers: L.LayerGroup;
    heatLayerGroup: L.LayerGroup;
    bairros: L.GeoJSON | null;
    busca: L.LayerGroup;
  } | null>(null);
  const ultimoLocalCentralizado = useRef<number | null>(null);
  // Focos carregados, para o cálculo local de reserva quando a RPC falha (ex.: offline)
  const focosRef = useRef(focos);
  useEffect(() => {
    focosRef.current = focos;
  }, [focos]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-23.3045, -51.1696],
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Agrupa focos próximos; no zoom máximo (ou com coordenadas idênticas) abre em leque
    const markers = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: criarIconeCluster,
    }).addTo(map);
    const buffers = L.layerGroup().addTo(map);
    const heatLayerGroup = L.layerGroup().addTo(map);
    const busca = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    layersRef.current = { markers, buffers, heatLayerGroup, bairros: null, busca };

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 15);
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#2563eb',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
      })
        .bindPopup('Você está aqui')
        .addTo(mapInstanceRef.current);
    }
  }, [userLocation]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !bairrosGeoJSON || !layersRef.current) return;

    if (layersRef.current.bairros) {
      map.removeLayer(layersRef.current.bairros);
    }

    layersRef.current.bairros = L.geoJSON(bairrosGeoJSON, {
      style: {
        color: '#64748b',
        weight: 1,
        fillOpacity: 0.03,
      },
    }).addTo(map);
  }, [bairrosGeoJSON]);

  // Local encontrado pela busca por endereço: marcador, raio de 200 m e resumo espacial
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.busca.clearLayers();
    if (!localBuscado) {
      ultimoLocalCentralizado.current = null;
      return;
    }

    const { lat, lng } = localBuscado;
    const bairro = identificarBairro(lat, lng, bairrosGeoJSON);
    let cancelado = false;

    L.circle([lat, lng], {
      radius: RAIO_BUSCA_METROS,
      color: '#2563eb',
      weight: 1.5,
      fillColor: '#2563eb',
      fillOpacity: 0.08,
      dashArray: '4, 4',
      interactive: false,
    }).addTo(layers.busca);

    const montarPopup = (resumoHtml: string) => `
      <div class="w-56 font-sans text-slate-800">
        <h3 class="font-bold text-sm">📌 Endereço buscado</h3>
        <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(localBuscado.nome)}</p>
        <p class="text-xs text-slate-500 mt-1">Bairro: <strong>${escapeHtml(bairro)}</strong></p>
        ${resumoHtml}
      </div>
    `;
    const corContagem = (n: number) => (n > 0 ? 'text-red-600' : 'text-emerald-700');

    const marker = L.circleMarker([lat, lng], {
      radius: 9,
      fillColor: '#2563eb',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1,
    })
      .bindPopup(
        montarPopup(`<p class="text-xs mt-1 text-slate-400">Consultando focos num raio de ${RAIO_BUSCA_METROS} m…</p>`)
      )
      .addTo(layers.busca);

    // Consulta no servidor (PostGIS) sobre todo o histórico; se falhar, conta
    // localmente (Turf) sobre os focos já carregados no mapa.
    buscarFocosProximos(lat, lng, RAIO_BUSCA_METROS)
      .then((proximos) => {
        if (cancelado) return;
        const maisProximo = proximos[0];
        marker.setPopupContent(
          montarPopup(`
            <p class="text-xs mt-1 font-medium ${corContagem(proximos.length)}">
              ${proximos.length} foco(s) registrado(s) num raio de ${RAIO_BUSCA_METROS} m
            </p>
            ${
              maisProximo
                ? `<p class="text-xs text-slate-500">Mais próximo: <strong>${Math.round(
                    maisProximo.distancia_metros
                  )} m</strong> (${LABELS_TIPO[maisProximo.tipo]})</p>`
                : ''
            }
            <p class="text-[10px] text-slate-400 mt-0.5">Todo o histórico · consulta PostGIS</p>
          `)
        );
      })
      .catch(() => {
        if (cancelado) return;
        const n = contarFocosNoRaio(lat, lng, focosRef.current, RAIO_BUSCA_METROS);
        marker.setPopupContent(
          montarPopup(`
            <p class="text-xs mt-1 font-medium ${corContagem(n)}">
              ${n} foco(s) visível(is) num raio de ${RAIO_BUSCA_METROS} m
            </p>
            <p class="text-[10px] text-slate-400 mt-0.5">Servidor indisponível · cálculo local</p>
          `)
        );
      });

    // Só centraliza quando o local muda, não a cada recarga dos focos
    if (ultimoLocalCentralizado.current !== localBuscado.id) {
      ultimoLocalCentralizado.current = localBuscado.id;
      map.flyTo([lat, lng], 17, { duration: 0.8 });
      map.once('moveend', () => marker.openPopup());
    }

    return () => {
      cancelado = true;
    };
  }, [localBuscado, bairrosGeoJSON]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.markers.clearLayers();
    layers.buffers.clearLayers();
    layers.heatLayerGroup.clearLayers();

    if (mostrarHeatmap && focos.length > 0) {
      focos.forEach((foco) => {
        L.circle([foco.lat, foco.lng], {
          radius: 120,
          fillColor: foco.tipo === 'agua_parada' ? '#dc2626' : '#f59e0b',
          color: 'transparent',
          fillOpacity: 0.35,
        }).addTo(layers.heatLayerGroup);
      });
    }

    const novosMarcadores: L.CircleMarker[] = [];

    focos.forEach((foco) => {
      if (mostrarBuffers) {
        const bufferPolygon = gerarBuffer200m(foco.lat, foco.lng);
        L.geoJSON(bufferPolygon, {
          style: {
            color: '#ef4444',
            weight: 1.5,
            fillColor: '#ef4444',
            fillOpacity: 0.12,
            dashArray: '4, 4',
          },
        }).addTo(layers.buffers);
      }

      if (mostrarMarcadores) {
        const distanciaHtml = userLocation
          ? `<p class="text-xs text-blue-600 font-medium mt-1">📍 A ${calcularDistanciaMetros(
              userLocation.lat,
              userLocation.lng,
              foco.lat,
              foco.lng
            )}m de você</p>`
          : '';

        const fotoHtml = foco.foto_url
          ? `<img src="${escapeHtml(foco.foto_url)}" alt="Foto do foco" class="w-full h-32 object-cover rounded mt-2" />`
          : '';

        const statusOffline = foco.offline
          ? `<span class="inline-block bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-semibold">Pendente de sincronização</span>`
          : '';

        const popupContent = `
          <div class="w-56 font-sans text-slate-800">
            <div class="flex justify-between items-start gap-1">
              <h3 class="font-bold text-sm">${LABELS_TIPO[foco.tipo]}</h3>
              ${statusOffline}
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Bairro: <strong>${escapeHtml(foco.bairro)}</strong></p>
            <p class="text-xs text-slate-500">SE: <strong>${foco.semana_epi}</strong> • ${new Date(
          foco.criado_em
        ).toLocaleDateString('pt-BR')}</p>
            ${foco.descricao ? `<p class="text-xs mt-1.5 text-slate-700">${escapeHtml(foco.descricao)}</p>` : ''}
            ${distanciaHtml}
            ${fotoHtml}
          </div>
        `;

        const marker = L.circleMarker([foco.lat, foco.lng], {
          radius: 7,
          fillColor: foco.offline ? '#f59e0b' : '#dc2626',
          color: '#ffffff',
          weight: 2,
          fillOpacity: 0.9,
          offline: !!foco.offline,
        } as L.CircleMarkerOptions).bindPopup(popupContent);

        novosMarcadores.push(marker);
      }
    });

    // addLayers aceita qualquer Layer em runtime; os tipos só declaram Marker
    layers.markers.addLayers(novosMarcadores as unknown as L.Layer[]);
  }, [focos, mostrarHeatmap, mostrarBuffers, mostrarMarcadores, userLocation]);

  return <div ref={mapContainerRef} className="w-full h-full z-0" />;
}