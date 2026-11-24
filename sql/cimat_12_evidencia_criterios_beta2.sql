-- CIMAT beta.2: trazabilidad fuerte de la evidencia de cada criterio examinado.
-- Se amplía exclusivamente el disparador de las tablas nuevas, sin alterar la Biblioteca.
CREATE OR REPLACE FUNCTION public.cimat_12_validar_criterio_eval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_catalogo uuid;
 v_entrevista uuid;
 v_dialogo uuid;
 v_mensaje text;
 v_permitido boolean;
BEGIN
 SELECT e.catalogo_id,e.entrevista_id,e.dialogo_id
 INTO v_catalogo,v_entrevista,v_dialogo
 FROM public.cimat_12_evaluaciones e
 WHERE e.id=NEW.evaluacion_id AND e.creado_por=(SELECT auth.uid());
 IF v_catalogo IS NULL THEN RAISE EXCEPTION 'Evaluación no autorizada'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.cimat_087_entrevistas i
                WHERE i.id=v_entrevista AND i.usuario_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Entrevista no autorizada';
 END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.cimat_12_enlaces l
    JOIN public.cimat_12_catalogo c ON c.id=NEW.criterio_id
  WHERE l.origen_id=v_catalogo AND l.destino_id=c.id
    AND l.relacion IN ('evalua','caracteriza')
    AND c.origen_tipo IN ('criterio','caracteristica') AND c.activo
 ) INTO v_permitido;
 IF NOT v_permitido THEN RAISE EXCEPTION 'Criterio no asociado al elemento evaluado'; END IF;
 IF NEW.estado='respaldado' AND length(btrim(NEW.fragmento))<8 THEN
   RAISE EXCEPTION 'Para indicar respaldo se necesita evidencia textual concreta';
 END IF;
 IF length(btrim(coalesce(NEW.fragmento,'')))>0 THEN
   IF v_dialogo IS NOT NULL THEN
    SELECT t.mensaje_usuario INTO v_mensaje
      FROM public.cimat_11_dialogos t
      WHERE t.id=v_dialogo AND t.entrevista_id=v_entrevista AND t.usuario_id=(SELECT auth.uid());
   ELSE
    SELECT string_agg(r.respuesta,' ' ORDER BY r.pregunta_id) INTO v_mensaje
      FROM public.cimat_087_respuestas r
      WHERE r.entrevista_id=v_entrevista AND r.estado='respondida';
   END IF;
   IF strpos(coalesce(v_mensaje,''),NEW.fragmento)=0 THEN
     RAISE EXCEPTION 'La evidencia del criterio debe aparecer literalmente en el relato del trabajador';
   END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_validar_criterio_eval() FROM PUBLIC,anon,authenticated;
