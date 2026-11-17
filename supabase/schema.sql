-- 1. Habilitar extensão espacial PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Criar tabela de focos
CREATE TABLE public.focos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('agua_parada', 'lixo', 'caixa_dagua', 'outro')),
    descricao TEXT,
    foto_url TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom GEOGRAPHY(POINT, 4326) NOT NULL,
    bairro TEXT DEFAULT 'Não identificado',
    semana_epi INTEGER NOT NULL, -- Formato AAAASE (ex: 202646)
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índice espacial para consultas rápidas de proximidade e área
CREATE INDEX idx_focos_geom ON public.focos USING GIST (geom);
CREATE INDEX idx_focos_semana ON public.focos (semana_epi);

-- 3. Trigger para preencher automaticamente a coluna GEOGRAPHY a partir de lat/lng
CREATE OR REPLACE FUNCTION set_foco_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_foco_geom
BEFORE INSERT OR UPDATE ON public.focos
FOR EACH ROW EXECUTE FUNCTION set_foco_geom();

-- 4. Função RPC: Buscar focos em um raio (em metros) a partir da posição do usuário
CREATE OR REPLACE FUNCTION focos_proximos(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION, raio_metros INTEGER DEFAULT 500)
RETURNS TABLE (
    id UUID,
    tipo TEXT,
    descricao TEXT,
    foto_url TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    bairro TEXT,
    semana_epi INTEGER,
    criado_em TIMESTAMPTZ,
    distancia_metros DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id, f.tipo, f.descricao, f.foto_url, f.lat, f.lng, f.bairro, f.semana_epi, f.criado_em,
        ST_Distance(f.geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distancia_metros
    FROM public.focos f
    WHERE ST_DWithin(f.geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography, raio_metros)
    ORDER BY distancia_metros ASC;
END;
$$ LANGUAGE plpgsql;

-- 5. Políticas de Segurança (RLS) - Acesso público para leitura e inserção cidadã
ALTER TABLE public.focos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública de focos" ON public.focos FOR SELECT USING (true);
CREATE POLICY "Inserção pública de focos" ON public.focos FOR INSERT WITH CHECK (true);

-- Privilégios de tabela para a Data API (RLS só filtra linhas; sem GRANT o acesso é negado)
REVOKE ALL ON public.focos FROM anon, authenticated;
GRANT SELECT, INSERT ON public.focos TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.focos_proximos(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon, authenticated;

-- 6. Storage Bucket para fotos dos focos
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos-focos', 'fotos-focos', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Upload público de fotos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fotos-focos');
CREATE POLICY "Visualização pública de fotos" ON storage.objects FOR SELECT USING (bucket_id = 'fotos-focos');