-- CIMAT 1.0.0-beta.2 — Capa derivada independiente de la Biblioteca aprobada.
-- Ningún DROP/ALTER/UPDATE de tablas cimat_0852_* o dominios_conocimiento.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.cimat_12_practicas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE RESTRICT,
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 3 AND 250),
 descripcion text NOT NULL DEFAULT '' CHECK(length(descripcion)<=4000),
 naturaleza text NOT NULL DEFAULT 'explicita' CHECK(naturaleza IN ('explicita','interpretada')),
 documento_id uuid, pagina integer CHECK (pagina>0),
 fuente_apartado text NOT NULL DEFAULT '' CHECK(length(fuente_apartado)<=120),
 creado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(dominio_id,id),
 FOREIGN KEY(dominio_id,documento_id) REFERENCES public.documentos_dominio(dominio_id,id)
);
CREATE TABLE IF NOT EXISTS public.cimat_12_criterios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE RESTRICT,
 objetivo_tipo text NOT NULL CHECK(objetivo_tipo IN ('tarea','producto','practica','actividad','proceso')),
 objetivo_id uuid NOT NULL,
 texto text NOT NULL CHECK(length(btrim(texto)) BETWEEN 8 AND 1500),
 naturaleza text NOT NULL DEFAULT 'explicito' CHECK(naturaleza IN ('explicito','interpretado')),
 documento_id uuid, pagina integer CHECK (pagina>0),
 fuente_apartado text NOT NULL DEFAULT '' CHECK(length(fuente_apartado)<=120),
 revisado boolean NOT NULL DEFAULT false,
 creado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(dominio_id,id),
 FOREIGN KEY(dominio_id,documento_id) REFERENCES public.documentos_dominio(dominio_id,id)
);
CREATE TABLE IF NOT EXISTS public.cimat_12_catalogo (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
 origen_tipo text NOT NULL CHECK(origen_tipo IN ('proceso','actividad','tarea','producto','rol','caracteristica','practica','criterio')),
 origen_id uuid NOT NULL,
 nombre text NOT NULL,
 descripcion text NOT NULL DEFAULT '',
 codigo text NOT NULL DEFAULT '',
 documento_id uuid,
 pagina integer,
 naturaleza text NOT NULL DEFAULT 'explicito' CHECK(naturaleza IN ('explicito','interpretado')),
 texto_busqueda text NOT NULL,
 huella text NOT NULL,
 embedding extensions.vector(768),
 modelo_embedding text,
 embedding_actualizado timestamptz,
 indexado_en timestamptz NOT NULL DEFAULT now(),
 fts tsvector GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig,coalesce(texto_busqueda,''))) STORED,
 UNIQUE(dominio_id,origen_tipo,origen_id)
);
CREATE TABLE IF NOT EXISTS public.cimat_12_enlaces (
 origen_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE CASCADE,
 destino_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE CASCADE,
 relacion text NOT NULL CHECK (relacion IN ('entrada','salida','actualiza','participa','precede','contiene','caracteriza','evalua')),
 PRIMARY KEY(origen_id,destino_id,relacion)
);
CREATE TABLE IF NOT EXISTS public.cimat_12_alias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 catalogo_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE CASCADE,
 termino text NOT NULL CHECK(length(btrim(termino)) BETWEEN 3 AND 180),
 justificacion text NOT NULL DEFAULT '' CHECK(length(justificacion)<=800),
 revisado boolean NOT NULL DEFAULT false,
 creado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
 UNIQUE(catalogo_id,termino)
);
CREATE TABLE IF NOT EXISTS public.cimat_12_evaluaciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
 dialogo_id uuid REFERENCES public.cimat_11_dialogos(id) ON DELETE SET NULL,
 catalogo_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE RESTRICT,
 cita text NOT NULL CHECK(length(btrim(cita)) BETWEEN 8 AND 550),
 estado text NOT NULL DEFAULT 'posible' CHECK(estado IN ('posible','parcial','insuficiente','contradiccion','confirmado','descartado')),
 origen text NOT NULL DEFAULT 'ia' CHECK(origen IN ('ia','manual')),
 observacion text NOT NULL DEFAULT '' CHECK(length(observacion)<=1500),
 creado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cimat_12_criterios_evaluados (
 evaluacion_id uuid NOT NULL REFERENCES public.cimat_12_evaluaciones(id) ON DELETE CASCADE,
 criterio_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE RESTRICT,
 estado text NOT NULL DEFAULT 'sin_evidencia' CHECK(estado IN ('sin_evidencia','respaldado','contradiccion','no_aplica')),
 fragmento text NOT NULL DEFAULT '' CHECK(length(fragmento)<=550),
 observacion text NOT NULL DEFAULT '' CHECK(length(observacion)<=1000),
 PRIMARY KEY(evaluacion_id,criterio_id)
);
CREATE TABLE IF NOT EXISTS public.cimat_12_casos_piloto (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 titulo text NOT NULL UNIQUE,
 ocupacion text NOT NULL,
 consulta text NOT NULL CHECK(length(consulta) BETWEEN 20 AND 1500),
 esperado_origen_tipo text NOT NULL CHECK(esperado_origen_tipo IN ('tarea','producto','practica','criterio','actividad')),
 esperado_origen_id uuid NOT NULL,
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id),
 escenario text NOT NULL DEFAULT '',
 creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cimat_12_resultados_piloto (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evaluado_en timestamptz NOT NULL DEFAULT now(),
 configuracion text NOT NULL DEFAULT 'hibrida',
 casos integer NOT NULL,
 aciertos_top1 integer NOT NULL,
 aciertos_top5 integer NOT NULL,
 falsos_positivos_top5 integer NOT NULL,
 precision_top5 numeric(8,4),
 recall_top5 numeric(8,4),
 mrr numeric(8,4),
 tiempo_medio_ms numeric(12,3),
 notas text NOT NULL DEFAULT ''
);
-- Tablas derivadas: no exponer directamente; acceso controlado por API privada.
ALTER TABLE public.cimat_12_practicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_enlaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_evaluaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_criterios_evaluados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_casos_piloto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_12_resultados_piloto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cimat_12_practicas,public.cimat_12_criterios,public.cimat_12_catalogo,
 public.cimat_12_enlaces,public.cimat_12_alias,public.cimat_12_evaluaciones,
 public.cimat_12_criterios_evaluados,public.cimat_12_casos_piloto,
 public.cimat_12_resultados_piloto FROM PUBLIC,anon,authenticated;
-- Solo admins pueden registrar prácticas y criterios explícitamente.
GRANT SELECT,INSERT,UPDATE ON public.cimat_12_practicas,public.cimat_12_criterios,public.cimat_12_alias TO authenticated;
CREATE POLICY c12_admin_practicas ON public.cimat_12_practicas FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()));
CREATE POLICY c12_admin_criterios ON public.cimat_12_criterios FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()));
CREATE POLICY c12_admin_alias ON public.cimat_12_alias FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()));
-- Las correspondencias de entrevista siguen siendo privadas del participante.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cimat_12_evaluaciones TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cimat_12_criterios_evaluados TO authenticated;
CREATE POLICY c12_eval_read ON public.cimat_12_evaluaciones FOR SELECT TO authenticated
 USING (creado_por=(SELECT auth.uid()) AND private.cimat_087_tiene_cuestionario_propio(
   (SELECT s.cuestionario_id FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id)));
CREATE POLICY c12_eval_insert ON public.cimat_12_evaluaciones FOR INSERT TO authenticated
 WITH CHECK (creado_por=(SELECT auth.uid()) AND EXISTS
  (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c12_eval_update ON public.cimat_12_evaluaciones FOR UPDATE TO authenticated
 USING (creado_por=(SELECT auth.uid())) WITH CHECK (creado_por=(SELECT auth.uid()));
CREATE POLICY c12_eval_delete ON public.cimat_12_evaluaciones FOR DELETE TO authenticated
 USING (creado_por=(SELECT auth.uid()));
CREATE POLICY c12_criteria_eval_read ON public.cimat_12_criterios_evaluados FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones e WHERE e.id=evaluacion_id AND e.creado_por=(SELECT auth.uid())));
CREATE POLICY c12_criteria_eval_insert ON public.cimat_12_criterios_evaluados FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones e WHERE e.id=evaluacion_id AND e.creado_por=(SELECT auth.uid())));
CREATE POLICY c12_criteria_eval_update ON public.cimat_12_criterios_evaluados FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones e WHERE e.id=evaluacion_id AND e.creado_por=(SELECT auth.uid())))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones e WHERE e.id=evaluacion_id AND e.creado_por=(SELECT auth.uid())));
CREATE POLICY c12_criteria_eval_delete ON public.cimat_12_criterios_evaluados FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones e WHERE e.id=evaluacion_id AND e.creado_por=(SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS c12_catalogo_fts ON public.cimat_12_catalogo USING gin(fts);
CREATE INDEX IF NOT EXISTS c12_catalogo_trgm ON public.cimat_12_catalogo USING gin(nombre extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS c12_catalogo_embed ON public.cimat_12_catalogo USING hnsw(embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS c12_catalogo_dominio ON public.cimat_12_catalogo(dominio_id,origen_tipo);
CREATE INDEX IF NOT EXISTS c12_eval_user ON public.cimat_12_evaluaciones(creado_por,entrevista_id);
