-- ============================================================================
-- ESCUELA DE BICICROSS LOS BOYACÁ - ESQUEMA OFICIAL SUPABASE (POSTGRESQL + RLS)
-- Copia y pega este script en el "SQL Editor" de tu proyecto en https://supabase.com
-- ============================================================================

-- 1. Tabla de Configuración General (Tasa BCV, Precios, Pago Móvil)
CREATE TABLE IF NOT EXISTS public.configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.configuracion (clave, valor) VALUES
  ('tasa_dolar', '886.23'),
  ('precio_escuela', '10.00'),
  ('precio_mensualidad', '40.00'),
  ('precio_valida', '8.00')
ON CONFLICT (clave) DO NOTHING;

-- 2. Tabla de Atletas Inscritos en la Escuela Permanente
CREATE TABLE IF NOT EXISTS public.inscripciones_escuela (
  id TEXT PRIMARY KEY,
  usuario TEXT,
  clave_acceso TEXT DEFAULT '1234',
  nombre_atleta TEXT NOT NULL,
  apellido_atleta TEXT NOT NULL,
  cedula_atleta TEXT,
  numero_placa TEXT DEFAULT '#S/N',
  fecha_nacimiento DATE NOT NULL,
  genero TEXT NOT NULL,
  nivel TEXT NOT NULL,
  categoria TEXT NOT NULL,
  talla_bici TEXT,
  posee_bici TEXT,
  condicion_medica TEXT,
  nombre_rep TEXT NOT NULL,
  cedula_rep TEXT NOT NULL,
  telefono_rep TEXT NOT NULL,
  sector_res TEXT,
  metodo_pago TEXT NOT NULL,
  referencia TEXT NOT NULL,
  fecha_pago DATE NOT NULL,
  mes_pagado TEXT DEFAULT 'OCTUBRE 2026',
  comprobante_url TEXT,
  estado_verificacion TEXT DEFAULT 'PENDIENTE',
  solvencia TEXT DEFAULT 'EN REVISIÓN',
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Migración segura por si la tabla ya existe
ALTER TABLE public.inscripciones_escuela ADD COLUMN IF NOT EXISTS usuario TEXT;
ALTER TABLE public.inscripciones_escuela ADD COLUMN IF NOT EXISTS clave_acceso TEXT DEFAULT '••••••••';
ALTER TABLE public.inscripciones_escuela ADD COLUMN IF NOT EXISTS clave_hash TEXT;


-- 3. Tabla de Pagos de Mensualidades (Alumnos Regulares)
CREATE TABLE IF NOT EXISTS public.pagos_mensualidad (
  id TEXT PRIMARY KEY,
  atleta_id TEXT,
  nombre_atleta TEXT NOT NULL,
  numero_placa TEXT,
  cedula_rep TEXT NOT NULL,
  mes_pagado TEXT NOT NULL,
  monto_usd NUMERIC(10,2) DEFAULT 40.00,
  tasa_bcv NUMERIC(12,2),
  metodo_pago TEXT NOT NULL,
  referencia TEXT NOT NULL,
  fecha_pago DATE NOT NULL,
  comprobante_url TEXT,
  estado_verificacion TEXT DEFAULT 'PENDIENTE',
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Inscritos en la Copa / Válida BMX Race
CREATE TABLE IF NOT EXISTS public.inscripciones_valida (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  cedula TEXT NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  genero TEXT NOT NULL,
  numero_placa TEXT NOT NULL,
  modalidad TEXT DEFAULT 'Rin 20',
  categoria TEXT NOT NULL,
  club TEXT DEFAULT 'ESCUELA LOS BOYACÁ',
  telefono TEXT NOT NULL,
  estado TEXT DEFAULT 'ANZOÁTEGUI',
  ciudad TEXT DEFAULT 'BARCELONA',
  metodo_pago TEXT NOT NULL,
  referencia TEXT NOT NULL,
  fecha_pago DATE NOT NULL,
  comprobante_url TEXT,
  estado_verificacion TEXT DEFAULT 'PENDIENTE',
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de Suscriptores / Avisos de Eventos
CREATE TABLE IF NOT EXISTS public.leads_eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contacto TEXT UNIQUE NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Habilitar Row Level Security (RLS)
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripciones_escuela ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_mensualidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripciones_valida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_eventos ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura y escritura pública para permitir inscripciones y consulta desde la web
CREATE POLICY "Lectura publica configuracion" ON public.configuracion FOR SELECT USING (true);
CREATE POLICY "Actualizacion configuracion" ON public.configuracion FOR ALL USING (true);

CREATE POLICY "Insertar inscripcion escuela" ON public.inscripciones_escuela FOR INSERT WITH CHECK (true);
CREATE POLICY "Leer inscripcion escuela" ON public.inscripciones_escuela FOR SELECT USING (true);
CREATE POLICY "Actualizar inscripcion escuela" ON public.inscripciones_escuela FOR UPDATE USING (true);
CREATE POLICY "Eliminar inscripcion escuela" ON public.inscripciones_escuela FOR DELETE USING (true);

CREATE POLICY "Insertar pago mensualidad" ON public.pagos_mensualidad FOR INSERT WITH CHECK (true);
CREATE POLICY "Leer pago mensualidad" ON public.pagos_mensualidad FOR SELECT USING (true);
CREATE POLICY "Actualizar pago mensualidad" ON public.pagos_mensualidad FOR UPDATE USING (true);

CREATE POLICY "Insertar inscripcion valida" ON public.inscripciones_valida FOR INSERT WITH CHECK (true);
CREATE POLICY "Leer inscripcion valida" ON public.inscripciones_valida FOR SELECT USING (true);
CREATE POLICY "Actualizar inscripcion valida" ON public.inscripciones_valida FOR UPDATE USING (true);
CREATE POLICY "Eliminar inscripcion valida" ON public.inscripciones_valida FOR DELETE USING (true);

CREATE POLICY "Insertar leads" ON public.leads_eventos FOR INSERT WITH CHECK (true);

-- 7. Bucket de Storage para Captures de Pago (comprobantes-boyaca)
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes-boyaca', 'comprobantes-boyaca', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Subir captures publico" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'comprobantes-boyaca');

CREATE POLICY "Ver captures publico" ON storage.objects
  FOR SELECT USING (bucket_id = 'comprobantes-boyaca');
