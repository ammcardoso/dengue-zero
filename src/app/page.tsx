'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Plus, Layers, BarChart3, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { supabase, Foco } from '@/lib/supabase';
import { db } from '@/lib/db';
import { sincronizarPendentes } from '@/lib/sync';
import ReportModal from '@/components/ReportModal';
import AddressSearch from '@/components/AddressSearch';
import type { ResultadoGeocodificacao } from '@/lib/geocoding';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function HomePage() {
  const [focos, setFocos] = useState<Foco[]>([]);
  const [periodo, setPeriodo] = useState<'2w' | '4w' | 'all'>('4w');
  const [mostrarHeatmap, setMostrarHeatmap] = useState(true);
  const [mostrarBuffers, setMostrarBuffers] = useState(false);
  const [mostrarMarcadores, setMostrarMarcadores] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [bairrosGeoJSON, setBairrosGeoJSON] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendentesCount, setPendentesCount] = useState(0);
  const [localBuscado, setLocalBuscado] = useState<ResultadoGeocodificacao | null>(null);

  // Carrega malha de bairros do IBGE
  useEffect(() => {
    fetch('/data/bairros.geojson')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBairrosGeoJSON(data))
      .catch(() => null);
  }, []);

  // Carrega dados do Supabase + fila local IndexedDB
  const carregarDados = useCallback(async () => {
    const pendentes = await db.focosPendentes.where('sincronizado').equals(0).toArray();
    setPendentesCount(pendentes.length);

    const focosLocais: Foco[] = pendentes.map((p) => ({
      id: `local-${p.localId}`,
      tipo: p.tipo,
      descricao: p.descricao,
      lat: p.lat,
      lng: p.lng,
      bairro: p.bairro,
      semana_epi: p.semana_epi,
      criado_em: p.criado_em,
      offline: true,
    }));

    let query = supabase.from('focos').select('*').order('criado_em', { ascending: false });

    if (periodo !== 'all') {
      const dias = periodo === '2w' ? 14 : 28;
      const dataCorte = new Date(Date.now() - dias * 86400000).toISOString();
      query = query.gte('criado_em', dataCorte);
    }

    const { data, error } = await query;

    if (!error && data) {
      await db.focosCache.clear();
      await db.focosCache.bulkPut(data);
      setFocos([...focosLocais, ...data]);
    } else {
      // Fallback offline: lê do cache do IndexedDB
      const cached = await db.focosCache.toArray();
      setFocos([...focosLocais, ...cached]);
    }
  }, [periodo]);

  // Monitora rede e dispara Background Sync
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      await sincronizarPendentes();
      carregarDados();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Captura posição inicial do usuário
    navigator.geolocation?.getCurrentPosition((pos) => {
      setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });

    carregarDados();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [carregarDados]);

  return (
    <main className="relative w-screen h-screen overflow-hidden flex flex-col bg-slate-100">
      {/* Barra Superior */}
      <header className="z-20 bg-white/95 backdrop-blur shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
          <h1 className="font-extrabold text-slate-800 tracking-tight text-lg">Dengue Zero</h1>
          {isOnline ? (
            <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
              <Wifi className="w-3 h-3" /> Online
            </span>
          ) : (
            <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pendentesCount > 0 && (
            <button
              onClick={async () => {
                await sincronizarPendentes();
                carregarDados();
              }}
              className="text-xs bg-amber-500 text-white px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sincronizar ({pendentesCount})
            </button>
          )}
          <Link
            href="/painel"
            className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 hover:bg-slate-700"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Painel Gestor</span>
          </Link>
        </div>
      </header>

      {/* Mapa Interativo */}
      <div className="flex-1 relative">
        <MapView
          focos={focos}
          mostrarHeatmap={mostrarHeatmap}
          mostrarBuffers={mostrarBuffers}
          mostrarMarcadores={mostrarMarcadores}
          userLocation={userLocation}
          bairrosGeoJSON={bairrosGeoJSON}
          localBuscado={localBuscado}
        />

        {/* Controles de Busca, Camadas e Filtro Temporal */}
        <div className="absolute top-3 left-3 right-14 sm:right-auto sm:w-80 z-10 flex flex-col items-start gap-2">
          <div className="w-full">
            <AddressSearch
              isOnline={isOnline}
              onSelect={setLocalBuscado}
              onClear={() => setLocalBuscado(null)}
            />
          </div>

          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as any)}
            className="bg-white/95 backdrop-blur text-xs font-semibold text-slate-700 px-3 py-2 rounded-lg shadow border border-slate-200 outline-none"
          >
            <option value="2w">Últimas 2 semanas</option>
            <option value="4w">Últimas 4 semanas</option>
            <option value="all">Todo o histórico</option>
          </select>

          <div className="bg-white/95 backdrop-blur p-2 rounded-lg shadow border border-slate-200 space-y-1.5 text-xs text-slate-700">
            <div className="font-bold text-slate-600 flex items-center gap-1 pb-1 border-b">
              <Layers className="w-3.5 h-3.5" /> Camadas SIG
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarHeatmap}
                onChange={(e) => setMostrarHeatmap(e.target.checked)}
                className="accent-red-600"
              />
              <span>Mapa de Calor</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarBuffers}
                onChange={(e) => setMostrarBuffers(e.target.checked)}
                className="accent-red-600"
              />
              <span>Buffer Risco (200m)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarMarcadores}
                onChange={(e) => setMostrarMarcadores(e.target.checked)}
                className="accent-red-600"
              />
              <span>Pontos ({focos.length})</span>
            </label>
          </div>
        </div>

        {/* Legenda do Heatmap */}
        {mostrarHeatmap && (
          <div className="absolute bottom-6 left-3 z-10 bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow text-[11px] border border-slate-200">
            <span className="font-bold text-slate-700 block mb-1">Densidade de Risco</span>
            <div className="w-28 h-2 rounded bg-gradient-to-r from-green-500 via-yellow-400 to-red-600" />
            <div className="flex justify-between text-slate-500 mt-0.5">
              <span>Baixa</span>
              <span>Alta</span>
            </div>
          </div>
        )}

        {/* Botão Flutuante (FAB) - Registrar Foco */}
        <button
          onClick={() => setModalOpen(true)}
          className="absolute bottom-6 right-4 z-10 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-3.5 rounded-full shadow-lg flex items-center gap-2 transition transform active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Registrar foco</span>
        </button>
      </div>

      {/* Modal de Registro (Tela 2) */}
      <ReportModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={carregarDados}
        initialCoords={userLocation}
        bairrosGeoJSON={bairrosGeoJSON}
      />
    </main>
  );
}