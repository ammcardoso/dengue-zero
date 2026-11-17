import { db, FocoOffline } from './db';
import { supabase } from './supabase';

export async function salvarFocoOfflineOuOnline(dados: Omit<FocoOffline, 'localId' | 'sincronizado'>) {
  // 1. Sempre salva primeiro no IndexedDB (garantia offline-first)
  const localId = await db.focosPendentes.add({
    ...dados,
    sincronizado: 0,
  });

  // 2. Se houver internet, tenta sincronizar imediatamente
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    await sincronizarPendentes();
  }

  return localId;
}

export async function sincronizarPendentes(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;

  const pendentes = await db.focosPendentes.where('sincronizado').equals(0).toArray();
  let enviados = 0;

  for (const item of pendentes) {
    try {
      let foto_url: string | undefined = undefined;

      // Upload da foto se existir Blob
      if (item.fotoBlob) {
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('fotos-focos')
          .upload(fileName, item.fotoBlob, { contentType: 'image/jpeg' });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('fotos-focos')
            .getPublicUrl(fileName);
          foto_url = publicUrlData.publicUrl;
        }
      }

      // Inserção na tabela PostGIS
      const { error: insertError } = await supabase.from('focos').insert({
        tipo: item.tipo,
        descricao: item.descricao,
        foto_url,
        lat: item.lat,
        lng: item.lng,
        bairro: item.bairro,
        semana_epi: item.semana_epi,
        criado_em: item.criado_em,
      });

      if (!insertError && item.localId) {
        await db.focosPendentes.delete(item.localId);
        enviados++;
      }
    } catch (err) {
      console.error('Falha ao sincronizar item offline:', err);
    }
  }

  return enviados;
}