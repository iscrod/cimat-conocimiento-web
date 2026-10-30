-- CIMAT v0.8 · Analizador IA · metadatos de ejecución sin texto documental
-- Ejecutar una sola vez sobre el esquema v0.7.1.
CREATE TABLE IF NOT EXISTS public.ia_extracciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE RESTRICT,
 documento_id uuid NOT NULL REFERENCES public.documentos_dominio(id) ON DELETE RESTRICT,
 pagina_inicio integer NOT NULL CHECK (pagina_inicio >= 1 AND pagina_inicio <= 200),
 pagina_fin integer NOT NULL CHECK (pagina_fin >= pagina_inicio AND pagina_fin <= pagina_inicio + 1),
 proveedor text NOT NULL DEFAULT 'gemini',
 modelo text NOT NULL,
 estado text NOT NULL CHECK (estado IN ('iniciado','completado','sin_resultados','fallido','parcial')),
 elementos_nuevos integer NOT NULL DEFAULT 0 CHECK (elementos_nuevos >= 0),
 relaciones_nuevas integer NOT NULL DEFAULT 0 CHECK (relaciones_nuevas >= 0),
 descartes_sin_evidencia integer NOT NULL DEFAULT 0 CHECK (descartes_sin_evidencia >= 0),
 creado_por uuid NOT NULL REFERENCES auth.users(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 finalizado_en timestamptz
);
ALTER TABLE public.ia_extracciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_extracciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ia_extracciones TO authenticated;
CREATE POLICY "Solo admin lee metadatos de análisis IA"
ON public.ia_extracciones FOR SELECT TO authenticated
USING ((SELECT private.es_administrador_plataforma()));
GRANT SELECT, INSERT, UPDATE ON public.ia_extracciones TO service_role;
GRANT SELECT, INSERT ON public.conocimiento_elementos, public.conocimiento_relaciones TO service_role;
CREATE INDEX IF NOT EXISTS ia_extracciones_documento_fecha
ON public.ia_extracciones(documento_id, creado_en DESC);
