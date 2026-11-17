'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Foco } from '@/lib/supabase';
import { gerarBuffer200m, calcularDistanciaMetros } from '@/lib/geo';

interface MapViewProps {
  focos: Foco[];
  mostrarHeatmap: boolean;
  mostrarBuffers: boolean;
  mostrarMarcadores: boolean;
  userLocation: { lat: number; lng: number } | null;
  bairrosGeoJSON?: any;
}

const LABELS_TIPO: Record<Foco['tipo'], string> = {
  agua_parada: '💧 Água parada',
  lixo: '🗑️ Lixo acumulado',
  caixa_dagua: '🛢️ Caixa d\'água aberta',
  outro: '⚠️ Outro criadouro',
};

export default function MapView({
  focos,
  mostrarHeatmap,
  mostrarBuffers,
  mostrarMarcadores,
  userLocation,
  bairrosGeoJSON,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    markers: L.LayerGroup;
    buffers: L.LayerGroup;
    heatLayerGroup: L.LayerGroup;
    bairros: L.GeoJSON | null;
  } | null>(null);

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

    const markers = L.layerGroup().addTo(map);
    const buffers = L.layerGroup().addTo(map);
    const heatLayerGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    layersRef.current = { markers, buffers, heatLayerGroup, bairros: null };

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
          ? `<img src="${foco.foto_url}" alt="Foto do foco" class="w-full h-32 object-cover rounded mt-2" />`
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
            <p class="text-xs text-slate-500 mt-0.5">Bairro: <strong>${foco.bairro}</strong></p>
            <p class="text-xs text-slate-500">SE: <strong>${foco.semana_epi}</strong> • ${new Date(
          foco.criado_em
        ).toLocaleDateString('pt-BR')}</p>
            ${foco.descricao ? `<p class="text-xs mt-1.5 text-slate-700">${foco.descricao}</p>` : ''}
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
        }).bindPopup(popupContent);

        marker.addTo(layers.markers);
      }
    });
  }, [focos, mostrarHeatmap, mostrarBuffers, mostrarMarcadores, userLocation]);

  return <div ref={mapContainerRef} className="w-full h-full z-0" />;
}