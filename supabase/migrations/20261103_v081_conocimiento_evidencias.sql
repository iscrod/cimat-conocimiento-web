-- CIMAT v0.8.1: evidencias múltiples por elemento canónico.
-- Ya aplicada en Supabase con la migración cimat_v081_evidencias_por_pagina_sin_duplicar_elementos.
CREATE TABLE public.conocimiento_evidencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE RESTRICT,
 elemento_id uuid NOT NULL,
 documento_id uuid NOT NULL,
 pagina integer NOT NULL CHECK(pagina BETWEEN 1 AND 200),
 cita text NOT NULL CHECK(length(btrim(cita)) BETWEEN 15 AND 300),
 creado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(dominio_id,elemento_id) REFERENCES public.conocimiento_elementos(dominio_id,id) ON DELETE CASCADE,
 FOREIGN KEY(dominio_id,documento_id) REFERENCES public.documentos_dominio(dominio_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(documento_id,pagina) REFERENCES public.documento_paginas(documento_id,pagina) ON DELETE RESTRICT,
 CONSTRAINT conocimiento_evidencia_unica UNIQUE(elemento_id,documento_id,pagina,cita)
);
CREATE INDEX conocimiento_evidencias_por_dominio ON public.conocimiento_evidencias(dominio_id,elemento_id);
ALTER TABLE public.conocimiento_evidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conocimiento_evidencias FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.conocimiento_evidencias TO authenticated;
CREATE POLICY "Admin consulta evidencias" ON public.conocimiento_evidencias
 FOR SELECT TO authenticated USING ((SELECT private.es_administrador_plataforma()));
CREATE POLICY "Admin registra evidencias" ON public.conocimiento_evidencias
 FOR INSERT TO authenticated WITH CHECK
 ((SELECT private.es_administrador_plataforma()) AND creado_por=(SELECT auth.uid()));
