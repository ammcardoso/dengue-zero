'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Download, Activity, MapPin } from 'lucide-react';
import { supabase, Foco } from '@/lib/supabase';
import { exportarParaGeoJSON } from '@/lib/geo';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function PainelGestorPage() {
  const [focos, setFocos] = useState<Foco[]>([]);
  const [semanaFiltro, setSemanaFiltro] = useState<string>('todas');
  const [infoDengueCasos, setInfoDengueCasos] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('focos')
        .select('*')
        .order('criado_em', { ascending: false });
      if (data) setFocos(data);

      // Consulta opcional à Edge Function do InfoDengue
      try {
        const { data: epiData } = await supabase.functions.invoke('infodengue');
        if (Array.isArray(epiData) && epiData.length > 0) {
          setInfoDengueCasos(epiData[0].casos_est || epiData[0].casos || 0);
        }
      } catch {
        // Ignora caso a Edge Function ainda não esteja implantada
      }
    }
    load();
  }, []);

  // Lista única de semanas epidemiológicas presentes nos dados
  const semanasDisponiveis = useMemo(() => {
    const set = new Set(focos.map((f) => String(f.semana_epi)));
    return Array.from(set).sort().reverse();
  }, [focos]);

  // Filtra focos pela semana selecionada
  const focosFiltrados = useMemo(() => {
    if (semanaFiltro === 'todas') return focos;
    return focos.filter((f) => String(f.semana_epi) === semanaFiltro);
  }, [focos, semanaFiltro]);

  // Agregação espacial: Contagem por Bairro
  const contagemPorBairro = useMemo(() => {
    const mapa: Record<string, number> = {};
    focosFiltrados.forEach((f) => {
      const b = f.bairro || 'Não identificado';
      mapa[b] = (mapa[b] || 0) + 1;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [focosFiltrados]);

  // Agregação temporal: Contagem por Semana Epidemiológica (para gráfico de barras)
  const contagemPorSemana = useMemo(() => {
    const mapa: Record<string, number> = {};
    focos.forEach((f) => {
      const se = String(f.semana_epi);
      mapa[se] = (mapa[se] || 0) + 1;
    });
    return Object.entries(mapa).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [focos]);

  const handleExportarGeoJSON = () => {
    const geojsonStr = exportarParaGeoJSON(focosFiltrados);
    const blob = new Blob([geojsonStr], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dengue-zero-focos-${semanaFiltro}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxSemanaCount = Math.max(...contagemPorSemana.map((s) => s[1]), 1);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-300 hover:text-white flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Voltar ao Mapa
          </Link>
          <h1 className="font-bold text-lg">Dengue Zero — Painel de Vigilância Epidemiológica</h1>
        </div>
        <button
          onClick={handleExportarGeoJSON}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition"
        >
          <Download className="w-4 h-4" /> Exportar GeoJSON (QGIS)
        </button>
      </header>

      {/* Corpo dividido: Mapa (60%) + Painel Analítico (40%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-7 h-[50vh] lg:h-auto relative">
          <MapView
            focos={focosFiltrados}
            mostrarHeatmap={true}
            mostrarBuffers={true}
            mostrarMarcadores={true}
            userLocation={null}
          />
        </div>

        <aside className="lg:col-span-5 bg-white p-6 border-l border-slate-200 space-y-6 overflow-y-auto">
          {/* Filtro de Semana Epidemiológica */}
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold text-slate-700">Semana Epidemiológica:</label>
            <select
              value={semanaFiltro}
              onChange={(e) => setSemanaFiltro(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium bg-slate-50"
            >
              <option value="todas">Todas as semanas ({focos.length})</option>
              {semanasDisponiveis.map((se) => (
                <option key={se} value={se}>
                  SE {se}
                </option>
              ))}
            </select>
          </div>

          {/* Cards de Resumo + Integração InfoDengue */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-red-50 border border-red-100">
              <div className="flex items-center gap-2 text-red-700 text-xs font-bold uppercase">
                <MapPin className="w-4 h-4" /> Focos Reportados
              </div>
              <p className="text-2xl font-extrabold text-red-900 mt-1">{focosFiltrados.length}</p>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex items-center gap-2 text-blue-700 text-xs font-bold uppercase">
                <Activity className="w-4 h-4" /> InfoDengue (Estimativa)
              </div>
              <p className="text-2xl font-extrabold text-blue-900 mt-1">
                {infoDengueCasos !== null ? `${Math.round(infoDengueCasos)} casos` : 'API Conectada'}
              </p>
            </div>
          </div>

          {/* Gráfico de Barras por Semana Epidemiológica */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-3">Evolução por Semana Epidemiológica</h2>
            <div className="flex items-end gap-3 h-32 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {contagemPorSemana.map(([se, qtd]) => (
                <div key={se} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-slate-700">{qtd}</span>
                  <div
                    style={{ height: `${(qtd / maxSemanaCount) * 70}px` }}
                    className="w-full bg-red-500 rounded-t transition-all"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">{se.slice(4)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabela de Agregação por Bairro (Ponto-dentro-de-polígono) */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-2">
              Contagem de Focos por Bairro (IBGE)
            </h2>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Bairro</th>
                    <th className="px-4 py-2.5 text-right">Focos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {contagemPorBairro.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                        Nenhum foco registrado neste filtro.
                      </td>
                    </tr>
                  ) : (
                    contagemPorBairro.map(([bairro, qtd]) => (
                      <tr key={bairro} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{bairro}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600">{qtd}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}