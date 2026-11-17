'use client';

import { useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { buscarEndereco, ResultadoGeocodificacao } from '@/lib/geocoding';

interface AddressSearchProps {
  isOnline: boolean;
  onSelect: (resultado: ResultadoGeocodificacao) => void;
  onClear: () => void;
}

export default function AddressSearch({ isOnline, onSelect, onClear }: AddressSearchProps) {
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<ResultadoGeocodificacao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setErro('A busca por endereço precisa de internet.');
      return;
    }
    if (consulta.trim().length < 3) {
      setErro('Digite pelo menos 3 caracteres.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCarregando(true);
    setErro(null);
    try {
      const lista = await buscarEndereco(consulta, controller.signal);
      setResultados(lista);
      if (lista.length === 0) setErro('Nenhum endereço encontrado em Londrina.');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErro('Falha ao consultar o serviço de endereços.');
        setResultados(null);
      }
    } finally {
      setCarregando(false);
    }
  };

  const limpar = () => {
    abortRef.current?.abort();
    setConsulta('');
    setResultados(null);
    setErro(null);
    onClear();
  };

  return (
    <div className="bg-white/95 backdrop-blur rounded-lg shadow border border-slate-200 text-xs">
      <form onSubmit={handleSubmit} className="flex items-center gap-1 px-2">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar endereço em Londrina…"
          aria-label="Buscar endereço"
          className="flex-1 min-w-0 bg-transparent py-2 text-slate-800 outline-none placeholder:text-slate-400"
        />
        {carregando ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
        ) : (
          consulta && (
            <button type="button" onClick={limpar} aria-label="Limpar busca" className="text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )
        )}
        <button type="submit" className="font-semibold text-red-600 hover:text-red-700 pl-1">
          Buscar
        </button>
      </form>

      {erro && <p className="px-3 pb-2 text-slate-500">{erro}</p>}

      {resultados && resultados.length > 0 && (
        <ul className="border-t border-slate-100 max-h-56 overflow-y-auto">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setResultados(null);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 leading-snug"
              >
                {r.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
