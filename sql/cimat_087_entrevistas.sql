-- CIMAT 0.8.7 — Entrevistas genéricas de conocimiento tácito.
-- Los datos individuales son privados del propio usuario; no se comparten con empresas ni administradores.
-- Sin IA, comparación normativa ni transcripciones de voz en esta versión.

-- La única nueva lectura del instrumento 0.8.6 es la de versiones PUBLICADAS,
-- y solo por participantes autorizados. Los borradores continúan restringidos.
CREATE OR REPLACE FUNCTION public.cimat_087_puede_entrevistarse()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $func$
 SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      private.es_administrador_plataforma()
      OR EXISTS (
        SELECT 1 FROM public.usuario_empresa_rol AS u
        JOIN public.roles AS r ON r.id = u.rol_id
        JOIN public.empresas AS e ON e.id = u.empresa_id
        WHERE u.usuario_id = (SELECT auth.uid())
          AND u.activo IS TRUE
          AND e.activa IS TRUE
          AND r.nombre = 'entrevistado'
      )
    );
$func$;
REVOKE ALL ON FUNCTION public.cimat_087_puede_entrevistarse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cimat_087_puede_entrevistarse() TO authenticated;

CREATE POLICY cimat_086_participante_publicados
ON public.cimat_086_cuestionarios
FOR SELECT TO authenticated
USING (estado = 'publicado' AND (SELECT public.cimat_087_puede_entrevistarse()));

CREATE TABLE public.cimat_087_entrevistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cuestionario_id uuid NOT NULL REFERENCES public.cimat_086_cuestionarios(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','finalizada')),
  consentimiento_confirmado boolean NOT NULL CHECK (consentimiento_confirmado IS TRUE),
  consentimiento_version text NOT NULL CHECK (consentimiento_version = 'cimat-0.8.7-1'),
  consentimiento_fecha timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  finalizado_en timestamptz,
  CONSTRAINT cimat_087_finalizacion_consistente CHECK
    ((estado = 'en_curso' AND finalizado_en IS NULL)
     OR (estado = 'finalizada' AND finalizado_en IS NOT NULL))
);
COMMENT ON TABLE public.cimat_087_entrevistas IS
  'Sesiones personales con consentimiento afirmativo y cuestionario publicado. Sin datos personales de terceros. Borrar la sesion revoca consentimiento y elimina respuestas.';
CREATE INDEX cimat_087_entrevistas_usuario_actualizadas
ON public.cimat_087_entrevistas(usuario_id, actualizado_en DESC);
ALTER TABLE public.cimat_087_entrevistas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cimat_087_entrevistas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cimat_087_entrevistas TO authenticated;

CREATE TABLE public.cimat_087_respuestas (
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  pregunta_id text NOT NULL CHECK (char_length(pregunta_id) BETWEEN 1 AND 100),
  estado text NOT NULL CHECK (estado IN ('respondida','omitida')),
  respuesta text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entrevista_id, pregunta_id),
  CONSTRAINT cimat_087_respuesta_valida CHECK (
    (estado = 'respondida' AND respuesta IS NOT NULL AND
      char_length(btrim(respuesta)) BETWEEN 1 AND 10000)
    OR (estado = 'omitida' AND respuesta IS NULL)
  )
);
COMMENT ON TABLE public.cimat_087_respuestas IS
  'Respuestas textuales originales o preguntas omitidas, sin inferencias. Accesibles solo al usuario entrevistado.';
ALTER TABLE public.cimat_087_respuestas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cimat_087_respuestas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cimat_087_respuestas TO authenticated;

-- Las sesiones son visibles y administrables solamente por su propietario.
-- Ser administrador o experto no permite leer respuestas de otras personas.
CREATE POLICY cimat_087_sesion_ver ON public.cimat_087_entrevistas
FOR SELECT TO authenticated USING (usuario_id = (SELECT auth.uid()));
CREATE POLICY cimat_087_sesion_crear ON public.cimat_087_entrevistas
FOR INSERT TO authenticated
WITH CHECK (
 usuario_id = (SELECT auth.uid())
 AND (SELECT public.cimat_087_puede_entrevistarse())
 AND consentimiento_confirmado IS TRUE
 AND consentimiento_version = 'cimat-0.8.7-1'
 AND estado = 'en_curso'
 AND EXISTS (
   SELECT 1 FROM public.cimat_086_cuestionarios AS c
   WHERE c.id = cuestionario_id AND c.estado = 'publicado'
 )
);
CREATE POLICY cimat_087_sesion_actualizar ON public.cimat_087_entrevistas
FOR UPDATE TO authenticated
USING (usuario_id = (SELECT auth.uid()) AND estado = 'en_curso')
WITH CHECK (usuario_id = (SELECT auth.uid()) AND estado IN ('en_curso','finalizada'));
CREATE POLICY cimat_087_sesion_borrar ON public.cimat_087_entrevistas
FOR DELETE TO authenticated USING (usuario_id = (SELECT auth.uid()));

CREATE POLICY cimat_087_respuesta_ver ON public.cimat_087_respuestas
FOR SELECT TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.cimat_087_entrevistas AS s
 WHERE s.id = entrevista_id AND s.usuario_id = (SELECT auth.uid())
));
CREATE POLICY cimat_087_respuesta_crear ON public.cimat_087_respuestas
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
 SELECT 1 FROM public.cimat_087_entrevistas AS s
 WHERE s.id = entrevista_id AND s.usuario_id = (SELECT auth.uid())
 AND s.estado = 'en_curso'
));
CREATE POLICY cimat_087_respuesta_actualizar ON public.cimat_087_respuestas
FOR UPDATE TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.cimat_087_entrevistas AS s
 WHERE s.id = entrevista_id AND s.usuario_id = (SELECT auth.uid())
 AND s.estado = 'en_curso'
))
WITH CHECK (EXISTS (
 SELECT 1 FROM public.cimat_087_entrevistas AS s
 WHERE s.id = entrevista_id AND s.usuario_id = (SELECT auth.uid())
 AND s.estado = 'en_curso'
));

-- Confirmación de que la respuesta corresponde a una pregunta activa de la
-- versión fijada en la sesión. El cliente no puede inventar IDs de preguntas.
CREATE FUNCTION public.cimat_087_validar_respuesta()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $func$
DECLARE habilitada boolean;
BEGIN
 IF TG_OP = 'UPDATE' AND (
   NEW.entrevista_id IS DISTINCT FROM OLD.entrevista_id OR
   NEW.pregunta_id IS DISTINCT FROM OLD.pregunta_id OR
   NEW.creado_en IS DISTINCT FROM OLD.creado_en
 ) THEN
   RAISE EXCEPTION 'No es posible modificar la pertenencia de una respuesta.';
 END IF;
 SELECT EXISTS (
   SELECT 1 FROM public.cimat_087_entrevistas AS s
   JOIN public.cimat_086_cuestionarios AS c ON c.id = s.cuestionario_id,
   LATERAL jsonb_array_elements(c.preguntas) AS q(p)
   WHERE s.id = NEW.entrevista_id
     AND s.usuario_id = (SELECT auth.uid())
     AND s.estado = 'en_curso'
     AND q.p ->> 'id' = NEW.pregunta_id
     AND q.p ->> 'habilitada' = 'true'
 ) INTO habilitada;
 IF NOT habilitada THEN
   RAISE EXCEPTION 'La entrevista no está activa o la pregunta no pertenece al instrumento publicado.';
 END IF;
 IF TG_OP = 'INSERT' THEN
   NEW.creado_en := clock_timestamp();
 END IF;
 NEW.actualizado_en := clock_timestamp();
 RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION public.cimat_087_validar_respuesta() FROM PUBLIC, anon;
CREATE TRIGGER cimat_087_respuesta_guard
BEFORE INSERT OR UPDATE ON public.cimat_087_respuestas
FOR EACH ROW EXECUTE FUNCTION public.cimat_087_validar_respuesta();

-- Inmutabilidad de sesión, transición en curso → finalizada y comprobación
-- de que todas las preguntas habilitadas tienen respuesta o fueron omitidas.
CREATE FUNCTION public.cimat_087_validar_sesion()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $func$
DECLARE pendiente boolean;
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.estado <> 'en_curso' OR NEW.consentimiento_confirmado IS DISTINCT FROM TRUE
      OR NEW.consentimiento_version <> 'cimat-0.8.7-1' THEN
      RAISE EXCEPTION 'La sesión requiere consentimiento informado explícito.';
   END IF;
   IF NOT EXISTS (
     SELECT 1 FROM public.cimat_086_cuestionarios AS c
     WHERE c.id = NEW.cuestionario_id AND c.estado = 'publicado'
   ) THEN
      RAISE EXCEPTION 'Solo se permiten cuestionarios publicados.';
   END IF;
   NEW.creado_en := clock_timestamp();
   NEW.consentimiento_fecha := NEW.creado_en;
   NEW.actualizado_en := NEW.creado_en;
   NEW.finalizado_en := NULL;
   RETURN NEW;
 END IF;
 IF OLD.estado <> 'en_curso' THEN
   RAISE EXCEPTION 'Las entrevistas finalizadas son de solo lectura.';
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR
    NEW.usuario_id IS DISTINCT FROM OLD.usuario_id OR
    NEW.cuestionario_id IS DISTINCT FROM OLD.cuestionario_id OR
    NEW.consentimiento_confirmado IS DISTINCT FROM OLD.consentimiento_confirmado OR
    NEW.consentimiento_version IS DISTINCT FROM OLD.consentimiento_version OR
    NEW.consentimiento_fecha IS DISTINCT FROM OLD.consentimiento_fecha OR
    NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
   RAISE EXCEPTION 'No se puede cambiar el propietario, consentimiento ni instrumento.';
 END IF;
 IF NEW.estado = 'finalizada' THEN
   SELECT EXISTS (
     SELECT 1 FROM public.cimat_086_cuestionarios AS c,
       LATERAL jsonb_array_elements(c.preguntas) AS q(p)
     WHERE c.id = OLD.cuestionario_id AND q.p ->> 'habilitada' = 'true'
       AND NOT EXISTS (
         SELECT 1 FROM public.cimat_087_respuestas AS a
         WHERE a.entrevista_id = OLD.id AND a.pregunta_id = q.p ->> 'id'
       )
   ) INTO pendiente;
   IF pendiente THEN
     RAISE EXCEPTION 'Responde u omite todas las preguntas antes de finalizar.';
   END IF;
   NEW.finalizado_en := clock_timestamp();
 ELSE
   NEW.finalizado_en := NULL;
 END IF;
 NEW.actualizado_en := clock_timestamp();
 RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION public.cimat_087_validar_sesion() FROM PUBLIC, anon;
CREATE TRIGGER cimat_087_sesion_guard
BEFORE INSERT OR UPDATE ON public.cimat_087_entrevistas
FOR EACH ROW EXECUTE FUNCTION public.cimat_087_validar_sesion();

-- Para no abrir acceso a cuentas sin rol, solo usuarios con asignación
-- activa de 'entrevistado' o administradores globales pueden iniciar sesiones.
-- Una sesión propia existente sigue disponible para revisión y eliminación
-- aunque posteriormente se retire el rol del usuario.
