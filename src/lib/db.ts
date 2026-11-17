import Dexie, { Table } from 'dexie';
import { Foco } from './supabase';

export interface FocoOffline {
  localId?: number;
  tipo: Foco['tipo'];
  descricao?: string;
  fotoBlob?: Blob; // Armazena a imagem binária localmente enquanto offline
  lat: number;
  lng: number;
  bairro: string;
  semana_epi: number;
  criado_em: string;
  sincronizado: number; // 0 = pendente, 1 = sincronizado
}

export class DengueDatabase extends Dexie {
  focosPendentes!: Table<FocoOffline, number>;
  focosCache!: Table<Foco, string>;

  constructor() {
    super('DengueZeroDB');
    this.version(1).stores({
      focosPendentes: '++localId, sincronizado, criado_em',
      focosCache: 'id, bairro, semana_epi, criado_em',
    });
  }
}

export const db = new DengueDatabase();