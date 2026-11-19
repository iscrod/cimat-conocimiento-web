-- CIMAT 0.8.6 — Banco de preguntas genericas, versionado e independiente de normas.
-- Solo almacena el instrumento, nunca entrevistas ni datos de empleados.
CREATE TABLE IF NOT EXISTS public.cimat_086_cuestionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 180),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado')),
  preguntas jsonb NOT NULL DEFAULT '[]'::jsonb,
  origen_id uuid REFERENCES public.cimat_086_cuestionarios(id) ON DELETE RESTRICT,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cimat_086_preguntas_array CHECK (
    jsonb_typeof(preguntas) = 'array' AND jsonb_array_length(preguntas) <= 200
  ),
  CONSTRAINT cimat_086_titulo_version_unique UNIQUE (titulo, version)
);
COMMENT ON TABLE public.cimat_086_cuestionarios IS
  'Instrumentos genéricos versionados. Las entrevistas se diseñarán en 0.8.7.';
ALTER TABLE public.cimat_086_cuestionarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cimat_086_cuestionarios FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cimat_086_cuestionarios TO authenticated;

-- Reutilizamos la comprobación existente de administración; no se confía en metadatos editables del JWT.
CREATE POLICY cimat_086_admin_lectura ON public.cimat_086_cuestionarios
  FOR SELECT TO authenticated USING ((SELECT public.mi_acceso_administrador()));
CREATE POLICY cimat_086_admin_insertar ON public.cimat_086_cuestionarios
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.mi_acceso_administrador()));
CREATE POLICY cimat_086_admin_actualizar ON public.cimat_086_cuestionarios
  FOR UPDATE TO authenticated
  USING ((SELECT public.mi_acceso_administrador()) AND estado = 'borrador')
  WITH CHECK ((SELECT public.mi_acceso_administrador()));

CREATE OR REPLACE FUNCTION public.cimat_086_proteger_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'publicado' THEN
      RAISE EXCEPTION 'Una versión publicada es inmutable.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.version IS DISTINCT FROM OLD.version OR
       NEW.creado_en IS DISTINCT FROM OLD.creado_en OR
       NEW.creado_por IS DISTINCT FROM OLD.creado_por OR
       NEW.origen_id IS DISTINCT FROM OLD.origen_id THEN
      RAISE EXCEPTION 'No es posible modificar identificadores ni metadatos de origen.';
    END IF;
    NEW.actualizado_en := clock_timestamp();
  END IF;
  IF NEW.estado = 'publicado' AND
     NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.preguntas) AS q
                 WHERE q->>'habilitada' = 'true') THEN
    RAISE EXCEPTION 'Para publicar se necesita al menos una pregunta habilitada.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cimat_086_proteger_version() FROM PUBLIC;
DROP TRIGGER IF EXISTS cimat_086_guard_version ON public.cimat_086_cuestionarios;
CREATE TRIGGER cimat_086_guard_version
  BEFORE INSERT OR UPDATE ON public.cimat_086_cuestionarios
  FOR EACH ROW EXECUTE FUNCTION public.cimat_086_proteger_version();

INSERT INTO public.cimat_086_cuestionarios
  (titulo, version, estado, preguntas)
VALUES (
  'Cuestionario genérico de extracción de conocimiento tácito',
  1,
  'borrador',
  '[{"id":"c086-inicial-01","orden":1,"dimension":"contexto","prioridad":"principal","pregunta":"¿Podría contarme qué hace normalmente en su trabajo?","objetivo":"Conocer el contexto del trabajo sin suponer actividades ni normas.","sondeos":["¿Cómo describiría su trabajo a una persona que no lo conoce?"],"habilitada":true},{"id":"c086-inicial-02","orden":2,"dimension":"actividades","prioridad":"principal","pregunta":"¿Cuáles son las principales actividades que realiza durante una jornada habitual?","objetivo":"Identificar actividades usando las palabras de la persona.","sondeos":["¿Qué otras actividades realiza algunos días?","¿Hay actividades que aparecen solo en determinadas situaciones?"],"habilitada":true},{"id":"c086-inicial-03","orden":3,"dimension":"seleccion","prioridad":"complementaria","pregunta":"¿Cuál de esas actividades conoce mejor o realiza con mayor frecuencia?","objetivo":"Seleccionar una actividad para profundizar sin imponer un proceso.","sondeos":["¿Por qué seleccionó esa actividad?"],"habilitada":true},{"id":"c086-inicial-04","orden":4,"dimension":"caso","prioridad":"principal","pregunta":"Piense en una ocasión reciente en que realizó esa actividad. ¿Qué ocurrió desde que comenzó hasta que terminó?","objetivo":"Obtener un episodio concreto que permita contrastar descripciones abstractas.","sondeos":["¿Qué sucedió exactamente en esa ocasión?","¿Qué hizo usted en ese momento?"],"habilitada":true},{"id":"c086-inicial-05","orden":5,"dimension":"inicio","prioridad":"complementaria","pregunta":"¿Qué ocurrió o qué recibió para saber que debía comenzar esa actividad?","objetivo":"Reconocer desencadenantes, entradas y señales observables.","sondeos":["¿Quién o qué le avisa que debe empezar?","¿Cómo sabe que la información recibida es suficiente?"],"habilitada":true},{"id":"c086-inicial-06","orden":6,"dimension":"secuencia","prioridad":"principal","pregunta":"¿Qué hizo primero y qué sucedió después, hasta terminar?","objetivo":"Reconstruir acciones y posibles precedencias sin asumir una secuencia normativa.","sondeos":["Después de eso, ¿qué ocurrió?","¿Hay pasos que pueden realizarse en otro orden?"],"habilitada":true},{"id":"c086-inicial-07","orden":7,"dimension":"recursos","prioridad":"complementaria","pregunta":"¿Qué información, materiales, documentos o herramientas utilizó para realizarla?","objetivo":"Reconocer recursos y artefactos realmente utilizados.","sondeos":["¿De dónde obtiene esa información?","¿Qué hace cuando falta algún recurso?"],"habilitada":true},{"id":"c086-inicial-08","orden":8,"dimension":"participantes","prioridad":"complementaria","pregunta":"¿Intervino alguna otra persona? ¿Qué hizo cada una y cómo se comunicaron?","objetivo":"Identificar interacciones y responsabilidades relatadas.","sondeos":["¿Cómo sabe cuándo debe pedir apoyo?","¿Qué información entrega o recibe de otras personas?"],"habilitada":true},{"id":"c086-inicial-09","orden":9,"dimension":"decisiones","prioridad":"principal","pregunta":"¿Hubo momentos en que tuvo que decidir qué hacer o cómo continuar?","objetivo":"Identificar criterios de juicio y posibles bifurcaciones.","sondeos":["¿En qué señales se fijó?","¿Qué otra opción tenía?","¿Cómo supo que su decisión funcionó?"],"habilitada":true},{"id":"c086-inicial-10","orden":10,"dimension":"excepciones","prioridad":"principal","pregunta":"¿Recuerda una ocasión en que tuvo que realizar esa actividad de una manera diferente?","objetivo":"Explorar variaciones, incidentes y adaptaciones prácticas.","sondeos":["¿Qué fue diferente en esa ocasión?","¿Qué hizo para resolverlo?","¿Cómo se dio cuenta de que había un problema?"],"habilitada":true},{"id":"c086-inicial-11","orden":11,"dimension":"experiencia","prioridad":"principal","pregunta":"¿Qué ha aprendido con la práctica que le ayuda a realizar mejor esa actividad?","objetivo":"Explorar heurísticas, anticipación, errores evitados y pericia.","sondeos":["¿Qué señales reconoce usted que una persona nueva podría pasar por alto?","¿Qué consejo daría a alguien que comienza?"],"habilitada":true},{"id":"c086-inicial-12","orden":12,"dimension":"validacion","prioridad":"principal","pregunta":"Voy a resumir lo que entendí de su explicación. ¿Qué corregiría o agregaría?","objetivo":"Validar con la persona el significado de los hallazgos sin convertir inferencias en hechos.","sondeos":["¿Hay algo importante que no le pregunté?","¿Hay alguna parte que entendí de manera incorrecta?"],"habilitada":true}]'::jsonb
)
ON CONFLICT (titulo, version) DO NOTHING;
