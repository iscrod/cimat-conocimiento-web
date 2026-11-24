-- CIMAT 1.0.0-beta: entrevista conversacional y trazabilidad hacia biblioteca.
-- No cambia las preguntas originales ni modifica las normas. El dialogo queda
-- restringido al propietario. La IA escribe por Edge Function autenticada.

CREATE TABLE public.cimat_11_dialogos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 mensaje_usuario text NOT NULL CHECK (length(btrim(mensaje_usuario)) BETWEEN 2 AND 4000),
 respuesta_ia text NOT NULL DEFAULT '' CHECK (length(respuesta_ia) <= 6000),
 estado text NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando','completado','error')),
 hallazgos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hallazgos)='array' AND jsonb_array_length(hallazgos) <= 8),
 coincidencias jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(coincidencias)='array' AND jsonb_array_length(coincidencias) <= 8),
 consentimiento_externo boolean NOT NULL CHECK (consentimiento_externo IS TRUE),
 consentimiento_version text NOT NULL CHECK (consentimiento_version='cimat-chat-1'),
 proveedor text NOT NULL DEFAULT 'gemini' CHECK (length(proveedor) <= 40),
 modelo text NOT NULL DEFAULT '' CHECK (length(modelo) <= 100),
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cimat_11_resultado_consistente CHECK (
   estado <> 'completado' OR length(btrim(respuesta_ia)) >= 4)
);
CREATE UNIQUE INDEX cimat_11_uno_procesando_por_entrevista
 ON public.cimat_11_dialogos (entrevista_id)
 WHERE estado='procesando';
CREATE INDEX cimat_11_por_entrevista
 ON public.cimat_11_dialogos(entrevista_id, creado_en, id);
ALTER TABLE public.cimat_11_dialogos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cimat_11_dialogos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.cimat_11_dialogos TO authenticated;
CREATE POLICY cimat_11_dialogos_propios
 ON public.cimat_11_dialogos FOR SELECT TO authenticated
 USING (usuario_id = (SELECT auth.uid()));

-- Los hallazgos del laboratorio beta también pueden vincularse a un mensaje del
-- trabajador dentro del chat; se conserva el modelo previo de fuentes.
ALTER TABLE public.cimat_10_hallazgos
 ADD COLUMN dialogo_id uuid REFERENCES public.cimat_11_dialogos(id) ON DELETE RESTRICT;
ALTER TABLE public.cimat_10_hallazgos
 DROP CONSTRAINT cimat_10_hallazgos_check;
ALTER TABLE public.cimat_10_hallazgos
 ADD CONSTRAINT cimat_10_hallazgos_fuente_unica
 CHECK (num_nonnulls(pregunta_id, seguimiento_id, dialogo_id) = 1);

CREATE OR REPLACE FUNCTION public.cimat_10_validar_hallazgo()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE original_text text;
BEGIN
 IF TG_OP='UPDATE' AND (
    NEW.entrevista_id IS DISTINCT FROM OLD.entrevista_id
 OR NEW.id IS DISTINCT FROM OLD.id
 OR NEW.pregunta_id IS DISTINCT FROM OLD.pregunta_id
 OR NEW.seguimiento_id IS DISTINCT FROM OLD.seguimiento_id
 OR NEW.dialogo_id IS DISTINCT FROM OLD.dialogo_id
 OR NEW.origen IS DISTINCT FROM OLD.origen
 OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
 ) THEN
  RAISE EXCEPTION 'No puedes reasignar una evidencia.';
 END IF;
 IF NEW.dialogo_id IS NOT NULL THEN
  SELECT d.mensaje_usuario INTO original_text
   FROM public.cimat_11_dialogos d
   WHERE d.id=NEW.dialogo_id AND d.entrevista_id=NEW.entrevista_id
   AND d.usuario_id=(SELECT auth.uid()) AND d.estado='completado';
 ELSIF NEW.pregunta_id IS NOT NULL THEN
  SELECT r.respuesta INTO original_text FROM public.cimat_087_respuestas r
   WHERE r.entrevista_id=NEW.entrevista_id AND r.pregunta_id=NEW.pregunta_id
   AND r.estado='respondida';
 ELSE
  SELECT s.respuesta INTO original_text FROM public.cimat_10_seguimientos s
   WHERE s.id=NEW.seguimiento_id AND s.entrevista_id=NEW.entrevista_id
     AND s.estado='respondido';
 END IF;
 IF original_text IS NULL OR position(NEW.evidencia_literal IN original_text)=0 THEN
   RAISE EXCEPTION 'La evidencia debe ser un fragmento literal de la respuesta original.';
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.estado='propuesto'; NEW.validado_en=NULL;
 ELSIF NEW.estado IN ('confirmado','rechazado') THEN
  NEW.validado_en=clock_timestamp();
 ELSE NEW.validado_en=NULL;
 END IF;
 NEW.actualizado_en=clock_timestamp();
 RETURN NEW;
END; $$;

COMMENT ON TABLE public.cimat_11_dialogos IS
 'Interacciones con IA: mensajes de la cuenta entrevistada, hipótesis y coincidencias normativas tentativas. No se concede acceso a otras cuentas.';
COMMENT ON COLUMN public.cimat_11_dialogos.coincidencias IS
 'Comparaciones exploratorias con catálogo de normas; nunca certifican cumplimiento.';
