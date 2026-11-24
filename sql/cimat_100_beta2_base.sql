-- CIMAT 1.0.0-beta.2. Capa aditiva: no altera tablas, disparadores ni vistas aprobadas.
-- Los identificadores originales de Biblioteca se preservan en origen_id.
CREATE TABLE IF NOT EXISTS public.cimat_12_indice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
 origen_tipo text NOT NULL CHECK(origen_tipo IN('proceso','actividad','tarea','producto','rol','practica')),
 origen_id uuid NOT NULL,
 titulo text NOT NULL CHECK(length(btrim(titulo)) BETWEEN 2 AND 350),
 descripcion text NOT NULL DEFAULT '' CHECK(length(descripcion)<=7000),
 codigo text,
 documento_id uuid REFERENCES public.documentos_dominio(id) ON DELETE SET NULL,
 pagina integer CHECK(pagina IS NULL OR pagina > 0),
 metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
 contenido_hash text NOT NULL,
 embedding extensions.vector(768),
 embedding_model text,
 estado text NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','retirado')),
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 busqueda tsvector GENERATED ALWAYS AS
  (to_tsvector('spanish'::regconfig,coalesce(titulo,'')||' '||coalesce(descripcion,'')||' '||coalesce(codigo,''))) STORED,
 CONSTRAINT cimat_12_unicidad_origen UNIQUE(dominio_id,origen_tipo,origen_id)
);
CREATE INDEX IF NOT EXISTS cimat_12_indice_busqueda ON public.cimat_12_indice USING gin(busqueda);
CREATE INDEX IF NOT EXISTS cimat_12_indice_dom_tipo ON public.cimat_12_indice(dominio_id,origen_tipo);
CREATE INDEX IF NOT EXISTS cimat_12_indice_vector_hnsw ON public.cimat_12_indice USING hnsw(embedding extensions.vector_cosine_ops);
CREATE TABLE IF NOT EXISTS public.cimat_12_practicas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
 codigo text CHECK(codigo IS NULL OR length(codigo)<=150),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 3 AND 350),
 descripcion text NOT NULL DEFAULT '' CHECK(length(descripcion)<=7000),
 documento_id uuid REFERENCES public.documentos_dominio(id) ON DELETE SET NULL,
 pagina integer CHECK(pagina IS NULL OR pagina>0),
 estado text NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','revisada')),
 creado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cimat_12_practicas_dom ON public.cimat_12_practicas(dominio_id,estado);
CREATE TABLE IF NOT EXISTS public.cimat_12_criterios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 indice_id uuid NOT NULL REFERENCES public.cimat_12_indice(id) ON DELETE CASCADE,
 criterio text NOT NULL CHECK(length(btrim(criterio)) BETWEEN 5 AND 1000),
 detalle text NOT NULL DEFAULT '' CHECK(length(detalle)<=3500),
 fuente text NOT NULL CHECK(fuente IN ('explicito','interpretacion')),
 documento_id uuid REFERENCES public.documentos_dominio(id) ON DELETE SET NULL,
 pagina integer CHECK(pagina IS NULL OR pagina>0),
 estado text NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','revisado')),
 origen_caracteristica_id uuid,
 creado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cimat_12_criterio_origen_unico UNIQUE (origen_caracteristica_id),
 CONSTRAINT cimat_12_fuente_explicita_documento CHECK (fuente<>'explicito' OR documento_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cimat_12_criterios_elemento ON public.cimat_12_criterios(indice_id,estado);
CREATE TABLE IF NOT EXISTS public.cimat_12_vinculos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
 origen_id uuid NOT NULL REFERENCES public.cimat_12_indice(id) ON DELETE CASCADE,
 destino_id uuid NOT NULL REFERENCES public.cimat_12_indice(id) ON DELETE CASCADE,
 tipo text NOT NULL CHECK(tipo IN ('contiene','realiza','utiliza','produce','precede','participa','relaciona')),
 origen text NOT NULL DEFAULT 'biblioteca' CHECK(origen IN ('biblioteca','manual')),
 descripcion text NOT NULL DEFAULT '',
 CONSTRAINT cimat_12_vinculo_unico UNIQUE(dominio_id,origen_id,destino_id,tipo),
 CONSTRAINT cimat_12_vinculo_no_mismo CHECK(origen_id<>destino_id)
);
CREATE INDEX IF NOT EXISTS cimat_12_vinculos_dominio ON public.cimat_12_vinculos(dominio_id,tipo);

-- La decisión humana sobre una correspondencia y cada criterio examinado se mantienen
-- separados del registro normativo. No se almacena "cumple" automáticamente.
CREATE TABLE IF NOT EXISTS public.cimat_12_evaluaciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
 dialogo_id uuid REFERENCES public.cimat_11_dialogos(id) ON DELETE SET NULL,
 elemento_id uuid NOT NULL REFERENCES public.cimat_12_indice(id) ON DELETE RESTRICT,
 hallazgo_id uuid REFERENCES public.cimat_10_hallazgos(id) ON DELETE SET NULL,
 evidencia_literal text NOT NULL CHECK(length(btrim(evidencia_literal)) BETWEEN 8 AND 2000),
 interpretacion text NOT NULL DEFAULT '' CHECK(length(interpretacion)<=4000),
 grado text NOT NULL DEFAULT 'pendiente' CHECK(grado IN ('pendiente','posible','parcial','no_corresponde','evidencia_suficiente')),
 revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 revisado_en timestamptz,
 creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cimat_12_evaluaciones_entrevista ON public.cimat_12_evaluaciones(entrevista_id);
CREATE TABLE IF NOT EXISTS public.cimat_12_evaluacion_criterios (
 evaluacion_id uuid NOT NULL REFERENCES public.cimat_12_evaluaciones(id) ON DELETE CASCADE,
 criterio_id uuid NOT NULL REFERENCES public.cimat_12_criterios(id) ON DELETE RESTRICT,
 estado text NOT NULL DEFAULT 'sin_evidencia' CHECK(estado IN ('sin_evidencia','evidencia_parcial','evidencia_identificada','no_aplica')),
 explicacion text NOT NULL DEFAULT '' CHECK(length(explicacion)<=2000),
 PRIMARY KEY(evaluacion_id,criterio_id)
);
-- Control de acceso. Catálogos solo administración global (motor consulta con service_role).
DO $policy$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['cimat_12_indice','cimat_12_practicas','cimat_12_criterios','cimat_12_vinculos','cimat_12_evaluaciones','cimat_12_evaluacion_criterios']
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
 END LOOP;
END $policy$;
GRANT SELECT ON public.cimat_12_indice,public.cimat_12_vinculos,public.cimat_12_criterios,public.cimat_12_practicas TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.cimat_12_practicas,public.cimat_12_criterios TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cimat_12_evaluaciones,public.cimat_12_evaluacion_criterios TO authenticated;
CREATE POLICY c12_catalogo_admin ON public.cimat_12_indice FOR SELECT TO authenticated USING (public.mi_acceso_administrador());
CREATE POLICY c12_vinculos_admin ON public.cimat_12_vinculos FOR SELECT TO authenticated USING (public.mi_acceso_administrador());
CREATE POLICY c12_practicas_ver ON public.cimat_12_practicas FOR SELECT TO authenticated USING (public.mi_acceso_administrador());
CREATE POLICY c12_practicas_add ON public.cimat_12_practicas FOR INSERT TO authenticated WITH CHECK (public.mi_acceso_administrador());
CREATE POLICY c12_practicas_edit ON public.cimat_12_practicas FOR UPDATE TO authenticated USING(public.mi_acceso_administrador()) WITH CHECK(public.mi_acceso_administrador());
CREATE POLICY c12_criterios_ver ON public.cimat_12_criterios FOR SELECT TO authenticated USING (public.mi_acceso_administrador());
CREATE POLICY c12_criterios_add ON public.cimat_12_criterios FOR INSERT TO authenticated WITH CHECK (public.mi_acceso_administrador());
CREATE POLICY c12_criterios_edit ON public.cimat_12_criterios FOR UPDATE TO authenticated USING(public.mi_acceso_administrador()) WITH CHECK(public.mi_acceso_administrador());
CREATE POLICY c12_evaluaciones_ver ON public.cimat_12_evaluaciones FOR SELECT TO authenticated USING(private.cimat_087_tiene_cuestionario_propio((SELECT cuestionario_id FROM public.cimat_087_entrevistas WHERE id=entrevista_id)) AND EXISTS(SELECT 1 FROM public.cimat_087_entrevistas e WHERE e.id=entrevista_id AND e.usuario_id=(SELECT auth.uid())));
CREATE POLICY c12_evaluaciones_add ON public.cimat_12_evaluaciones FOR INSERT TO authenticated WITH CHECK (EXISTS(SELECT 1 FROM public.cimat_087_entrevistas e WHERE e.id=entrevista_id AND e.usuario_id=(SELECT auth.uid())));
CREATE POLICY c12_evaluaciones_edit ON public.cimat_12_evaluaciones FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM public.cimat_087_entrevistas e WHERE e.id=entrevista_id AND e.usuario_id=(SELECT auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.cimat_087_entrevistas e WHERE e.id=entrevista_id AND e.usuario_id=(SELECT auth.uid())));
CREATE POLICY c12_eval_criterios_ver ON public.cimat_12_evaluacion_criterios FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones v JOIN public.cimat_087_entrevistas e ON e.id=v.entrevista_id WHERE v.id=evaluacion_id AND e.usuario_id=(SELECT auth.uid())));
CREATE POLICY c12_eval_criterios_add ON public.cimat_12_evaluacion_criterios FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones v JOIN public.cimat_087_entrevistas e ON e.id=v.entrevista_id WHERE v.id=evaluacion_id AND e.usuario_id=(SELECT auth.uid())));
CREATE POLICY c12_eval_criterios_edit ON public.cimat_12_evaluacion_criterios FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones v JOIN public.cimat_087_entrevistas e ON e.id=v.entrevista_id WHERE v.id=evaluacion_id AND e.usuario_id=(SELECT auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.cimat_12_evaluaciones v JOIN public.cimat_087_entrevistas e ON e.id=v.entrevista_id WHERE v.id=evaluacion_id AND e.usuario_id=(SELECT auth.uid())));
