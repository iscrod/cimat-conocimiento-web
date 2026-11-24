-- CIMAT 1.0.0-beta.2 | ampliacion NO destructiva de Biblioteca.
-- Los esquemas existentes cimat_0852_* y documentos_dominio no se alteran.
-- Indice derivado, extensiones de practicas/criterios, auditoria de correspondencias.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.cimat_102_practicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 3 AND 250),
  descripcion text NOT NULL DEFAULT '' CHECK(length(descripcion)<=6000),
  tipo_original text NOT NULL DEFAULT 'practica' CHECK(length(tipo_original)<=100),
  documento_id uuid REFERENCES public.documentos_dominio(id) ON DELETE SET NULL,
  pagina integer CHECK(pagina IS NULL OR pagina>0),
  naturaleza text NOT NULL DEFAULT 'explicita'
    CHECK(naturaleza IN ('explicita','interpretacion')),
  estado_revision text NOT NULL DEFAULT 'pendiente'
    CHECK(estado_revision IN ('pendiente','verificado','descartado')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cimat_102_criterios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
  elemento_tipo text NOT NULL CHECK(elemento_tipo IN ('tarea','producto','actividad','proceso','rol','practica')),
  elemento_id uuid NOT NULL,
  nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 3 AND 250),
  descripcion text NOT NULL DEFAULT '' CHECK(length(descripcion)<=6000),
  documento_id uuid REFERENCES public.documentos_dominio(id) ON DELETE SET NULL,
  pagina integer CHECK(pagina IS NULL OR pagina>0),
  naturaleza text NOT NULL DEFAULT 'explicita'
    CHECK(naturaleza IN ('explicita','interpretacion')),
  estado_revision text NOT NULL DEFAULT 'pendiente'
    CHECK(estado_revision IN ('pendiente','verificado','descartado')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cimat_102_equivalencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
  elemento_tipo text NOT NULL CHECK(elemento_tipo IN ('tarea','producto','actividad','proceso','rol','practica')),
  elemento_id uuid NOT NULL,
  termino text NOT NULL CHECK(length(btrim(termino)) BETWEEN 3 AND 250),
  justificacion text NOT NULL DEFAULT '' CHECK(length(justificacion)<=2000),
  documento_id uuid REFERENCES public.documentos_dominio(id) ON DELETE SET NULL,
  pagina integer CHECK(pagina IS NULL OR pagina>0),
  estado_revision text NOT NULL DEFAULT 'pendiente'
    CHECK(estado_revision IN ('pendiente','verificado','descartado')),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cimat_102_indice (
  id text PRIMARY KEY, -- tipo:uuid; conserva el ID original sin duplicarlo.
  dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE CASCADE,
  origen_tipo text NOT NULL CHECK(origen_tipo IN ('tarea','producto','actividad','proceso','rol','practica')),
  origen_id uuid NOT NULL,
  nombre text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  tipo_original text,
  codigo text,
  documento_id uuid,
  pagina integer,
  atributos jsonb NOT NULL DEFAULT '{}'::jsonb,
  texto_busqueda text NOT NULL DEFAULT '',
  terminos tsvector GENERATED ALWAYS AS
    (to_tsvector('spanish'::regconfig,coalesce(texto_busqueda,''))) STORED,
  embedding extensions.vector(768),
  embedding_modelo text,
  fingerprint text NOT NULL,
  indexado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(origen_tipo,origen_id)
);
CREATE INDEX IF NOT EXISTS cimat_102_indice_dominio ON public.cimat_102_indice(dominio_id,origen_tipo);
CREATE INDEX IF NOT EXISTS cimat_102_indice_fts ON public.cimat_102_indice USING gin(terminos);
CREATE INDEX IF NOT EXISTS cimat_102_indice_trgm ON public.cimat_102_indice USING gin(nombre extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cimat_102_indice_vector ON public.cimat_102_indice USING hnsw(embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS cimat_102_criterios_elemento ON public.cimat_102_criterios(elemento_tipo,elemento_id);
CREATE INDEX IF NOT EXISTS cimat_102_equivalencias_elemento ON public.cimat_102_equivalencias(elemento_tipo,elemento_id);

-- Registros sugeridos de correspondencias: conservan cita y detalles de recuperación
-- sin modificar el expediente ni el grafo del proceso real.
CREATE TABLE IF NOT EXISTS public.cimat_102_correspondencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  dialogo_id uuid REFERENCES public.cimat_11_dialogos(id) ON DELETE CASCADE,
  hallazgo_id uuid REFERENCES public.cimat_10_hallazgos(id) ON DELETE SET NULL,
  indice_id text NOT NULL,
  dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE RESTRICT,
  fuente_cita text NOT NULL CHECK(length(btrim(fuente_cita)) BETWEEN 8 AND 1000),
  justificacion text NOT NULL DEFAULT '' CHECK(length(justificacion)<=2000),
  criterios_evaluados jsonb NOT NULL DEFAULT '[]'::jsonb,
  pendientes jsonb NOT NULL DEFAULT '[]'::jsonb,
  similitud numeric,
  estado text NOT NULL DEFAULT 'candidato'
    CHECK(estado IN ('candidato','correspondencia_parcial','evidencia_insuficiente','descartado','revisado')),
  confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cimat_102_corr_entrevista ON public.cimat_102_correspondencias(entrevista_id,creado_en DESC);

-- Extensiones controladas por administrador; jamás se mezcla una interpretación con requisito normativo verificado.
DO $ddl$
DECLARE rel text;
BEGIN
 FOR rel IN SELECT unnest(ARRAY['cimat_102_practicas','cimat_102_criterios','cimat_102_equivalencias','cimat_102_indice'])
 LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rel);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',rel);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',rel);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT private.es_administrador_plataforma()))',
      rel||'_admin_read',rel);
 END LOOP;
END;$ddl$;
GRANT INSERT,UPDATE,DELETE ON public.cimat_102_practicas,public.cimat_102_criterios,
  public.cimat_102_equivalencias TO authenticated;
CREATE POLICY c102_practicas_admin_write ON public.cimat_102_practicas FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()));
CREATE POLICY c102_criterios_admin_write ON public.cimat_102_criterios FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()));
CREATE POLICY c102_equivalencias_admin_write ON public.cimat_102_equivalencias FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()));
ALTER TABLE public.cimat_102_correspondencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cimat_102_correspondencias FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cimat_102_correspondencias TO authenticated;
CREATE POLICY c102_corr_select ON public.cimat_102_correspondencias FOR SELECT TO authenticated
 USING (private.cimat_087_tiene_cuestionario_propio((SELECT cuestionario_id FROM public.cimat_087_entrevistas WHERE id=entrevista_id))
        AND EXISTS(SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c102_corr_insert ON public.cimat_102_correspondencias FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c102_corr_update ON public.cimat_102_correspondencias FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c102_corr_delete ON public.cimat_102_correspondencias FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));

-- Validar la procedencia de la evidencia y el elemento sin aceptar IDs inventados.
CREATE FUNCTION public.cimat_102_verificar_correspondencia()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_msg text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.entrevista_id IS DISTINCT FROM OLD.entrevista_id OR
   NEW.dialogo_id IS DISTINCT FROM OLD.dialogo_id OR
   NEW.indice_id IS DISTINCT FROM OLD.indice_id OR
   NEW.dominio_id IS DISTINCT FROM OLD.dominio_id OR
   NEW.fuente_cita IS DISTINCT FROM OLD.fuente_cita) THEN
   RAISE EXCEPTION 'No puede modificarse la procedencia de la correspondencia.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cimat_102_indice i
   WHERE i.id=NEW.indice_id AND i.dominio_id=NEW.dominio_id) THEN
   RAISE EXCEPTION 'Elemento de referencia inexistente.';
 END IF;
 IF NEW.dialogo_id IS NOT NULL THEN
   SELECT d.mensaje_usuario INTO v_msg FROM public.cimat_11_dialogos d
    WHERE d.id=NEW.dialogo_id AND d.entrevista_id=NEW.entrevista_id;
 ELSE
   SELECT r.respuesta INTO v_msg FROM public.cimat_087_respuestas r
    WHERE r.entrevista_id=NEW.entrevista_id AND
      r.respuesta LIKE '%'||NEW.fuente_cita||'%' LIMIT 1;
 END IF;
 IF v_msg IS NULL OR strpos(v_msg,NEW.fuente_cita)=0 THEN
   RAISE EXCEPTION 'La cita debe existir literalmente en el mensaje original.';
 END IF;
 NEW.actualizado_en=clock_timestamp();
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.cimat_102_verificar_correspondencia() FROM PUBLIC,anon;
CREATE TRIGGER c102_corr_guard BEFORE INSERT OR UPDATE ON public.cimat_102_correspondencias
 FOR EACH ROW EXECUTE FUNCTION public.cimat_102_verificar_correspondencia();

-- Rechaza prácticas/criterios asociados a fuentes de un dominio diferente.
CREATE FUNCTION public.cimat_102_verificar_fuente()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE origen_dom uuid; doc_dom uuid;
BEGIN
 IF NEW.documento_id IS NOT NULL THEN
   SELECT dominio_id INTO doc_dom FROM public.documentos_dominio WHERE id=NEW.documento_id;
   IF doc_dom IS DISTINCT FROM NEW.dominio_id THEN RAISE EXCEPTION 'Documento pertenece a otro dominio'; END IF;
 END IF;
 IF TG_TABLE_NAME='cimat_102_practicas' THEN RETURN NEW; END IF;
 EXECUTE format('SELECT dominio_id FROM public.%I WHERE id=$1',
   CASE NEW.elemento_tipo
    WHEN 'tarea' THEN 'cimat_0852_tareas'
    WHEN 'producto' THEN 'cimat_0852_productos'
    WHEN 'actividad' THEN 'cimat_0852_actividades'
    WHEN 'proceso' THEN 'cimat_0852_procesos'
    WHEN 'rol' THEN 'cimat_0852_roles_dominios'
    WHEN 'practica' THEN 'cimat_102_practicas'
   END) INTO origen_dom USING NEW.elemento_id;
 IF NEW.elemento_tipo='rol' THEN
   SELECT dominio_id INTO origen_dom FROM public.cimat_0852_roles_dominios
    WHERE rol_id=NEW.elemento_id AND dominio_id=NEW.dominio_id LIMIT 1;
 END IF;
 IF origen_dom IS DISTINCT FROM NEW.dominio_id THEN RAISE EXCEPTION 'Elemento no pertenece al dominio'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.cimat_102_verificar_fuente() FROM PUBLIC,anon;
CREATE TRIGGER c102_practica_fuente BEFORE INSERT OR UPDATE ON public.cimat_102_practicas
 FOR EACH ROW EXECUTE FUNCTION public.cimat_102_verificar_fuente();
CREATE TRIGGER c102_criterio_fuente BEFORE INSERT OR UPDATE ON public.cimat_102_criterios
 FOR EACH ROW EXECUTE FUNCTION public.cimat_102_verificar_fuente();
CREATE TRIGGER c102_equivalencia_fuente BEFORE INSERT OR UPDATE ON public.cimat_102_equivalencias
 FOR EACH ROW EXECUTE FUNCTION public.cimat_102_verificar_fuente();

-- Actualización determinista sin alterar registros aprobados ni invalidar embeddings no modificados.
CREATE FUNCTION public.cimat_102_reconstruir_indice()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE n integer;
BEGIN
 IF auth.role() NOT IN ('service_role') AND NOT private.es_administrador_plataforma() THEN
   RAISE EXCEPTION 'Solo el administrador puede reconstruir el índice';
 END IF;
 WITH nodes AS (
 SELECT 'proceso'::text tipo,p.id,p.dominio_id,p.nombre,p.descripcion,p.codigo,p.documento_id,p.pagina,
        NULL::text tipo_original,'{}'::jsonb attrs
 FROM public.cimat_0852_procesos p
 UNION ALL
 SELECT 'actividad',a.id,a.dominio_id,a.nombre,a.descripcion,a.codigo,a.documento_id,a.pagina,
        NULL::text,'{}'::jsonb FROM public.cimat_0852_actividades a
 UNION ALL
 SELECT 'tarea',t.id,t.dominio_id,t.nombre,t.descripcion,t.codigo,t.documento_id,t.pagina,
        NULL::text,
        jsonb_build_object(
          'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'nombre',r.nombre))
            FROM public.cimat_0852_tareas_roles tr JOIN public.cimat_0852_roles r ON r.id=tr.rol_id
            WHERE tr.tarea_id=t.id AND tr.dominio_id=t.dominio_id),'[]'::jsonb),
          'productos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'flujo',tp.flujo))
            FROM public.cimat_0852_tareas_productos tp JOIN public.cimat_0852_productos p ON p.id=tp.producto_id
            WHERE tp.tarea_id=t.id AND tp.dominio_id=t.dominio_id),'[]'::jsonb))
 FROM public.cimat_0852_tareas t
 UNION ALL
 SELECT 'producto',p.id,p.dominio_id,p.nombre,p.descripcion,NULL::text,p.documento_id,p.pagina,
        NULL::text,
        jsonb_build_object('caracteristicas',
          coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre,'descripcion',c.descripcion,'documento_id',c.documento_id,'pagina',c.pagina))
            FROM public.cimat_0852_caracteristicas c WHERE c.producto_id=p.id AND c.dominio_id=p.dominio_id),'[]'::jsonb))
 FROM public.cimat_0852_productos p
 UNION ALL
 SELECT 'rol',r.id,dr.dominio_id,r.nombre,coalesce(dr.funcion_local,r.funcion),r.abreviatura,
   dr.documento_id,dr.pagina,NULL::text,'{}'::jsonb
 FROM public.cimat_0852_roles_dominios dr JOIN public.cimat_0852_roles r ON r.id=dr.rol_id
 UNION ALL
 SELECT 'practica',p.id,p.dominio_id,p.nombre,p.descripcion,NULL::text,p.documento_id,p.pagina,
   p.tipo_original,jsonb_build_object('naturaleza',p.naturaleza,'revision',p.estado_revision)
 FROM public.cimat_102_practicas p WHERE p.estado_revision <> 'descartado'
 ), prepared AS (
 SELECT n.*,
   coalesce(n.nombre,'')||' '||coalesce(n.descripcion,'')||' '||coalesce(n.codigo,'')||' '||
   coalesce((SELECT string_agg(c.nombre||' '||c.descripcion,' ') FROM public.cimat_102_criterios c
     WHERE c.dominio_id=n.dominio_id AND c.elemento_tipo=n.tipo AND c.elemento_id=n.id AND c.estado_revision='verificado'),'')||' '||
   coalesce((SELECT string_agg(e.termino,' ') FROM public.cimat_102_equivalencias e
     WHERE e.dominio_id=n.dominio_id AND e.elemento_tipo=n.tipo AND e.elemento_id=n.id AND e.estado_revision='verificado'),'')||' '||
   n.attrs::text AS fulltext
 FROM nodes n
 )
 INSERT INTO public.cimat_102_indice(
   id,dominio_id,origen_tipo,origen_id,nombre,descripcion,tipo_original,codigo,documento_id,pagina,
   atributos,texto_busqueda,fingerprint)
 SELECT p.tipo||':'||p.id::text,p.dominio_id,p.tipo,p.id,p.nombre,coalesce(p.descripcion,''),
 p.tipo_original,p.codigo,p.documento_id,p.pagina,p.attrs,p.fulltext,md5(p.fulltext||coalesce(p.documento_id::text,'')||coalesce(p.pagina::text,''))
 FROM prepared p
 ON CONFLICT(id) DO UPDATE SET
  nombre=EXCLUDED.nombre,descripcion=EXCLUDED.descripcion,tipo_original=EXCLUDED.tipo_original,
  codigo=EXCLUDED.codigo,documento_id=EXCLUDED.documento_id,pagina=EXCLUDED.pagina,
  atributos=EXCLUDED.atributos,texto_busqueda=EXCLUDED.texto_busqueda,
  embedding=CASE WHEN public.cimat_102_indice.fingerprint=EXCLUDED.fingerprint
    THEN public.cimat_102_indice.embedding ELSE NULL END,
  embedding_modelo=CASE WHEN public.cimat_102_indice.fingerprint=EXCLUDED.fingerprint
    THEN public.cimat_102_indice.embedding_modelo ELSE NULL END,
  fingerprint=EXCLUDED.fingerprint,indexado_en=clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT;
 -- El índice es derivado: eliminar entradas solo si el origen desapareció del catálogo.
 DELETE FROM public.cimat_102_indice i
 WHERE NOT EXISTS (SELECT 1 FROM public.cimat_0852_procesos p WHERE i.origen_tipo='proceso' AND p.id=i.origen_id)
 AND NOT EXISTS (SELECT 1 FROM public.cimat_0852_actividades p WHERE i.origen_tipo='actividad' AND p.id=i.origen_id)
 AND NOT EXISTS (SELECT 1 FROM public.cimat_0852_tareas p WHERE i.origen_tipo='tarea' AND p.id=i.origen_id)
 AND NOT EXISTS (SELECT 1 FROM public.cimat_0852_productos p WHERE i.origen_tipo='producto' AND p.id=i.origen_id)
 AND NOT EXISTS (SELECT 1 FROM public.cimat_0852_roles_dominios p WHERE i.origen_tipo='rol' AND p.rol_id=i.origen_id AND p.dominio_id=i.dominio_id)
 AND NOT EXISTS (SELECT 1 FROM public.cimat_102_practicas p WHERE i.origen_tipo='practica' AND p.id=i.origen_id);
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cimat_102_reconstruir_indice() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cimat_102_reconstruir_indice() TO authenticated,service_role;

-- Búsqueda híbrida: léxica siempre; semántica vectorial cuando hay embeddings.
-- Solo invocable desde backend de confianza (service_role), filtro público en la Edge Function.
CREATE FUNCTION public.cimat_102_buscar(
 q text, q_embedding extensions.vector(768) DEFAULT NULL, filtro_dominios uuid[] DEFAULT NULL, max_resultados integer DEFAULT 15
) RETURNS TABLE (id text,dominio_id uuid,origen_tipo text,origen_id uuid,nombre text,descripcion text,
 documento_id uuid,pagina integer,atributos jsonb,puntaje double precision,similaridad double precision)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT i.id,i.dominio_id,i.origen_tipo,i.origen_id,i.nombre,i.descripcion,i.documento_id,
   i.pagina,i.atributos,
   ((CASE WHEN length(btrim(coalesce(q,'')))>=3 THEN
     ts_rank_cd(i.terminos,websearch_to_tsquery('spanish',q)) ELSE 0 END)*0.35
     + extensions.similarity(i.nombre,coalesce(q,''))*0.25
     + CASE WHEN q_embedding IS NOT NULL AND i.embedding IS NOT NULL
       THEN (1 - (i.embedding <=> q_embedding))*0.4 ELSE 0 END)::double precision AS puntaje,
   CASE WHEN q_embedding IS NOT NULL AND i.embedding IS NOT NULL
       THEN (1 - (i.embedding <=> q_embedding))::double precision ELSE NULL END AS similaridad
 FROM public.cimat_102_indice i
 WHERE (filtro_dominios IS NULL OR i.dominio_id = ANY(filtro_dominios))
 ORDER BY puntaje DESC,i.id
 LIMIT greatest(1,least(coalesce(max_resultados,15),50));
$$;
REVOKE ALL ON FUNCTION public.cimat_102_buscar(text,extensions.vector(768),uuid[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cimat_102_buscar(text,extensions.vector(768),uuid[],integer) TO service_role;

COMMENT ON TABLE public.cimat_102_indice IS 'Índice derivado de referencia, NO sustituye modelos originales. Embeddings opcionales; coincidencia no equivale a conformidad.';
