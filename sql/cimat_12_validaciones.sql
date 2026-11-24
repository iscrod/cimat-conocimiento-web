-- CIMAT beta.2: comprobaciones de integridad y registro de revisión experta.
CREATE OR REPLACE FUNCTION public.cimat_12_validar_criterio()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE table_ok boolean;
BEGIN
 IF NOT (SELECT private.es_administrador_plataforma()) THEN RAISE EXCEPTION 'Solo admin global'; END IF;
 IF TG_OP='UPDATE' AND (NEW.dominio_id IS DISTINCT FROM OLD.dominio_id
   OR NEW.objetivo_tipo IS DISTINCT FROM OLD.objetivo_tipo OR NEW.objetivo_id IS DISTINCT FROM OLD.objetivo_id)
   THEN RAISE EXCEPTION 'No puedes cambiar el origen de un criterio; crea uno nuevo'; END IF;
 CASE NEW.objetivo_tipo
  WHEN 'tarea' THEN SELECT EXISTS(SELECT 1 FROM public.cimat_0852_tareas t WHERE t.id=NEW.objetivo_id AND t.dominio_id=NEW.dominio_id) INTO table_ok;
  WHEN 'producto' THEN SELECT EXISTS(SELECT 1 FROM public.cimat_0852_productos t WHERE t.id=NEW.objetivo_id AND t.dominio_id=NEW.dominio_id) INTO table_ok;
  WHEN 'actividad' THEN SELECT EXISTS(SELECT 1 FROM public.cimat_0852_actividades t WHERE t.id=NEW.objetivo_id AND t.dominio_id=NEW.dominio_id) INTO table_ok;
  WHEN 'proceso' THEN SELECT EXISTS(SELECT 1 FROM public.cimat_0852_procesos t WHERE t.id=NEW.objetivo_id AND t.dominio_id=NEW.dominio_id) INTO table_ok;
  WHEN 'practica' THEN SELECT EXISTS(SELECT 1 FROM public.cimat_12_practicas t WHERE t.id=NEW.objetivo_id AND t.dominio_id=NEW.dominio_id) INTO table_ok;
 END CASE;
 IF NOT coalesce(table_ok,false) THEN RAISE EXCEPTION 'Elemento de referencia inexistente o de otro modelo'; END IF;
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_validar_criterio() FROM PUBLIC;
CREATE TRIGGER cimat_12_criterio_guard BEFORE INSERT OR UPDATE ON public.cimat_12_criterios
 FOR EACH ROW EXECUTE FUNCTION public.cimat_12_validar_criterio();

CREATE OR REPLACE FUNCTION public.cimat_12_validar_eval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid; v_msg text; v_domain uuid;
BEGIN
 v_actor := (SELECT auth.uid());
 IF v_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=NEW.entrevista_id AND s.usuario_id=v_actor)
  THEN RAISE EXCEPTION 'La entrevista no pertenece al usuario'; END IF;
 IF NEW.creado_por IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'No puedes registrar para otro usuario'; END IF;
 IF TG_OP='UPDATE' AND (NEW.entrevista_id IS DISTINCT FROM OLD.entrevista_id OR
   NEW.catalogo_id IS DISTINCT FROM OLD.catalogo_id OR NEW.dialogo_id IS DISTINCT FROM OLD.dialogo_id
   OR NEW.cita IS DISTINCT FROM OLD.cita OR NEW.creado_por IS DISTINCT FROM OLD.creado_por)
   THEN RAISE EXCEPTION 'No se pueden cambiar la evidencia ni la procedencia'; END IF;
 SELECT c.dominio_id INTO v_domain FROM public.cimat_12_catalogo c
   WHERE c.id=NEW.catalogo_id AND c.activo;
 IF v_domain IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.dominios_conocimiento d WHERE d.id=v_domain
 AND (d.empresa_id IS NULL OR EXISTS(
  SELECT 1 FROM public.usuario_empresa_rol r JOIN public.empresas e ON e.id=r.empresa_id
  WHERE r.usuario_id=v_actor AND r.empresa_id=d.empresa_id AND r.activo AND e.activa))
 ) THEN RAISE EXCEPTION 'Modelo no autorizado'; END IF;
 IF NEW.dialogo_id IS NOT NULL THEN
 SELECT t.mensaje_usuario INTO v_msg FROM public.cimat_11_dialogos t
   WHERE t.id=NEW.dialogo_id AND t.entrevista_id=NEW.entrevista_id AND t.usuario_id=v_actor;
 ELSE
 SELECT string_agg(r.respuesta,' ') INTO v_msg FROM public.cimat_087_respuestas r
   WHERE r.entrevista_id=NEW.entrevista_id AND r.estado='respondida';
 END IF;
 IF coalesce(strpos(coalesce(v_msg,''),NEW.cita),0)=0
 THEN RAISE EXCEPTION 'La cita no figura en el relato del entrevistado'; END IF;
 NEW.actualizado_en=clock_timestamp();
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_validar_eval() FROM PUBLIC,anon;
CREATE TRIGGER cimat_12_eval_guard BEFORE INSERT OR UPDATE ON public.cimat_12_evaluaciones
 FOR EACH ROW EXECUTE FUNCTION public.cimat_12_validar_eval();

CREATE OR REPLACE FUNCTION public.cimat_12_validar_criterio_eval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_catalogo uuid; v_permitido boolean;
BEGIN
 SELECT e.catalogo_id INTO v_catalogo FROM public.cimat_12_evaluaciones e
 WHERE e.id=NEW.evaluacion_id AND e.creado_por=(SELECT auth.uid());
 IF v_catalogo IS NULL THEN RAISE EXCEPTION 'Evaluación no autorizada'; END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.cimat_12_enlaces l JOIN public.cimat_12_catalogo c ON c.id=NEW.criterio_id
  WHERE l.origen_id=v_catalogo AND l.destino_id=c.id
   AND l.relacion IN ('evalua','caracteriza') AND c.origen_tipo IN ('criterio','caracteristica')
 ) INTO v_permitido;
 IF NOT v_permitido THEN RAISE EXCEPTION 'Criterio no asociado al elemento evaluado'; END IF;
 IF NEW.estado='respaldado' AND length(btrim(NEW.fragmento))<8
 THEN RAISE EXCEPTION 'Para indicar respaldo se necesita evidencia textual concreta'; END IF;
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_validar_criterio_eval() FROM PUBLIC,anon;
CREATE TRIGGER cimat_12_criterio_eval_guard BEFORE INSERT OR UPDATE ON public.cimat_12_criterios_evaluados
 FOR EACH ROW EXECUTE FUNCTION public.cimat_12_validar_criterio_eval();

CREATE TABLE IF NOT EXISTS public.cimat_12_juicios_expertos (
 caso_id uuid NOT NULL REFERENCES public.cimat_12_casos_piloto(id) ON DELETE CASCADE,
 catalogo_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE CASCADE,
 revisor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 juicio text NOT NULL CHECK(juicio IN ('relevante','no_relevante','dudoso')),
 observacion text NOT NULL DEFAULT '' CHECK(length(observacion)<=1000),
 creado_en timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(caso_id,catalogo_id,revisor_id)
);
ALTER TABLE public.cimat_12_juicios_expertos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cimat_12_juicios_expertos FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cimat_12_juicios_expertos TO authenticated;
CREATE POLICY c12_juicios_admin ON public.cimat_12_juicios_expertos FOR ALL TO authenticated
 USING ((SELECT private.es_administrador_plataforma()))
 WITH CHECK ((SELECT private.es_administrador_plataforma()) AND revisor_id=(SELECT auth.uid()));

COMMENT ON TABLE public.cimat_12_juicios_expertos IS 'Etiquetas de relevancia por evaluador; necesarias para medir precision, falsos positivos y concordancia. No se rellenan automaticamente.';
COMMENT ON TABLE public.cimat_12_resultados_piloto IS 'Resultados de consultas sinteticas: la precision requiere juicios exhaustivos. No equivale a validacion con participantes reales.';
