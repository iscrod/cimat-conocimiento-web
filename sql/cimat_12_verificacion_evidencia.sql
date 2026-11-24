-- CIMAT beta.2: trazabilidad estricta de criterios y lectura directa de evaluaciones propias.
DROP POLICY IF EXISTS c12_eval_read ON public.cimat_12_evaluaciones;
CREATE POLICY c12_eval_read ON public.cimat_12_evaluaciones FOR SELECT TO authenticated
 USING (creado_por=(SELECT auth.uid()) AND EXISTS
   (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.cimat_12_validar_criterio_eval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_catalogo uuid; v_permitido boolean; v_fuente text; v_dialogo uuid; v_entrevista uuid;
BEGIN
 SELECT e.catalogo_id,e.dialogo_id,e.entrevista_id INTO v_catalogo,v_dialogo,v_entrevista
 FROM public.cimat_12_evaluaciones e
 WHERE e.id=NEW.evaluacion_id AND e.creado_por=(SELECT auth.uid());
 IF v_catalogo IS NULL THEN RAISE EXCEPTION 'Evaluación no autorizada'; END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.cimat_12_enlaces l JOIN public.cimat_12_catalogo c ON c.id=NEW.criterio_id
  WHERE l.origen_id=v_catalogo AND l.destino_id=c.id
   AND l.relacion IN ('evalua','caracteriza') AND c.origen_tipo IN ('criterio','caracteristica')
 ) INTO v_permitido;
 IF NOT v_permitido THEN RAISE EXCEPTION 'Criterio no asociado al elemento evaluado'; END IF;
 IF TG_OP='UPDATE' AND (OLD.evaluacion_id IS DISTINCT FROM NEW.evaluacion_id
  OR OLD.criterio_id IS DISTINCT FROM NEW.criterio_id) THEN
  RAISE EXCEPTION 'La relación criterio/evaluación es inmutable';
 END IF;
 IF NEW.estado='respaldado' THEN
  IF length(btrim(NEW.fragmento))<8 THEN
   RAISE EXCEPTION 'Para indicar respaldo se necesita evidencia textual';
  END IF;
  IF v_dialogo IS NOT NULL THEN
   SELECT t.mensaje_usuario INTO v_fuente
   FROM public.cimat_11_dialogos t
   WHERE t.id=v_dialogo AND t.entrevista_id=v_entrevista;
  ELSE
   SELECT string_agg(r.respuesta,' ') INTO v_fuente
   FROM public.cimat_087_respuestas r
   WHERE r.entrevista_id=v_entrevista AND r.estado='respondida';
  END IF;
  IF strpos(coalesce(v_fuente,''),NEW.fragmento)=0 THEN
   RAISE EXCEPTION 'El fragmento de respaldo debe estar textualmente en el relato';
  END IF;
 END IF;
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_validar_criterio_eval() FROM PUBLIC,anon,authenticated;

-- Conserva embeddings generados solo si el texto exacto indexado no cambió.
-- La reconstrucción del índice sigue siendo una operación administrativa.
