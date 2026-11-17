'use client';

import { useState } from 'react';
import { Camera, MapPin, X, CheckCircle2, WifiOff } from 'lucide-react';
import type { Foco } from '@/lib/supabase';
import { getSemanaEpidemiologica, identificarBairro } from '@/lib/geo';
import { salvarFocoOfflineOuOnline } from '@/lib/sync';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCoords: { lat: number; lng: number } | null;
  bairrosGeoJSON?: any;
}

export default function ReportModal({
  isOpen,
  onClose,
  onSuccess,
  initialCoords,
  bairrosGeoJSON,
}: ReportModalProps) {
  const [tipo, setTipo] = useState<Foco['tipo']>('agua_parada');
  const [descricao, setDescricao] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initialCoords);
  const [fotoBlob, setFotoBlob] = useState<Blob | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const capturarGPS = () => {
    setLoadingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoadingGps(false);
      },
      (err) => {
        alert('Não foi possível obter o GPS. Verifique as permissões do navegador.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoBlob(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) {
      alert('Por favor, capture a localização GPS antes de salvar.');
      return;
    }

    setSaving(true);
    try {
      const bairroDetectado = identificarBairro(coords.lat, coords.lng, bairrosGeoJSON);
      const semana_epi = getSemanaEpidemiologica(new Date());

      await salvarFocoOfflineOuOnline({
        tipo,
        descricao,
        fotoBlob,
        lat: coords.lat,
        lng: coords.lng,
        bairro: bairroDetectado,
        semana_epi,
        criado_em: new Date().toISOString(),
      });

      onSuccess();
      onClose();
    } catch (error) {
      alert('Erro ao salvar registro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-lg font-bold text-slate-800">Registrar Foco de Dengue</h2>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Tipo de foco */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Tipo de criadouro
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'agua_parada', label: '💧 Água parada' },
                { id: 'lixo', label: '🗑️ Lixo acumulado' },
                { id: 'caixa_dagua', label: '🛢️ Caixa d\'água' },
                { id: 'outro', label: '⚠️ Outro' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setTipo(item.id as Foco['tipo'])}
                  className={`p-2.5 text-sm rounded-lg border text-left font-medium transition ${
                    tipo === item.id
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Localização GPS */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Localização (EPSG:4326)
            </label>
            <button
              type="button"
              onClick={capturarGPS}
              disabled={loadingGps}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-medium text-sm hover:bg-blue-100"
            >
              <MapPin className="w-4 h-4" />
              {loadingGps ? 'Obtendo satélites...' : 'Capturar GPS Atual'}
            </button>
            {coords && (
              <p className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Lat: {coords.lat.toFixed(5)} | Lng: {coords.lng.toFixed(5)}
              </p>
            )}
          </div>

          {/* Foto (Câmera traseira no mobile) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Evidência Fotográfica
            </label>
            <label className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 text-slate-700 border border-dashed border-slate-300 rounded-lg font-medium text-sm cursor-pointer hover:bg-slate-200">
              <Camera className="w-4 h-4" />
              <span>{previewUrl ? 'Trocar foto' : 'Tirar foto ou anexar'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFotoChange}
                className="hidden"
              />
            </label>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="mt-2 w-full h-36 object-cover rounded-lg border"
              />
            )}
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Observações (opcional)
            </label>
            <textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Pneus empilhados no fundo do terreno baldio..."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none"
            />
          </div>

          {/* Aviso de modo offline */}
          {typeof navigator !== 'undefined' && !navigator.onLine && (
            <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-800 p-2.5 rounded-lg border border-amber-200">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>Você está offline. O registro será salvo no aparelho e enviado assim que houver sinal.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !coords}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition"
          >
            {saving ? 'Salvando...' : 'Salvar Registro'}
          </button>
        </form>
      </div>
    </div>
  );
}