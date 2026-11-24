-- CIMAT 1.0.0-beta: seguimiento adaptativo, hallazgos, relaciones y contrastes.
-- Las respuestas individuales siguen privadas del participante; no se amplían permisos
-- a otros roles. Cualquier comparación normativa se realiza DESPUÉS de entrevistar.
CREATE TABLE public.cimat_10_seguimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  pregunta_id text NOT NULL CHECK (char_length(pregunta_id) BETWEEN 1 AND 100),
  senal text NOT NULL CHECK (senal IN ('decision','excepcion','experiencia','ambiguedad','coordinacion','ejemplo','otro')),
  pregunta text NOT NULL CHECK (char_length(btrim(pregunta)) BETWEEN 10 AND 500),
  respuesta text CHECK (respuesta IS NULL OR char_length(respuesta) BETWEEN 1 AND 10000),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','respondido','omitido')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entrevista_id,pregunta_id,pregunta),
  CHECK ((estado='respondido' AND respuesta IS NOT NULL AND char_length(btrim(respuesta))>0)
    OR (estado IN ('pendiente','omitido') AND respuesta IS NULL))
);
CREATE TABLE public.cimat_10_hallazgos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('proceso','actividad','tarea','decision','rol','entrada','salida','excepcion','criterio')),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 180),
  descripcion text NOT NULL DEFAULT '' CHECK (char_length(descripcion)<=1200),
  pregunta_id text,
  seguimiento_id uuid REFERENCES public.cimat_10_seguimientos(id) ON DELETE RESTRICT,
  evidencia_literal text NOT NULL CHECK (char_length(btrim(evidencia_literal)) BETWEEN 8 AND 550),
  origen text NOT NULL CHECK (origen IN ('ia','manual')),
  modelo text CHECK (modelo IS NULL OR char_length(modelo)<=120),
  estado text NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto','confirmado','rechazado')),
  validado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(pregunta_id,seguimiento_id)=1)
);
CREATE TABLE public.cimat_10_relaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  origen_id uuid NOT NULL REFERENCES public.cimat_10_hallazgos(id) ON DELETE CASCADE,
  destino_id uuid NOT NULL REFERENCES public.cimat_10_hallazgos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('precede','contiene','participa','utiliza','genera','depende')),
  nota text NOT NULL DEFAULT '' CHECK (char_length(nota)<=700),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (origen_id<>destino_id),
  UNIQUE(entrevista_id,origen_id,destino_id,tipo)
);
CREATE TABLE public.cimat_10_contrastes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  hallazgo_id uuid NOT NULL REFERENCES public.cimat_10_hallazgos(id) ON DELETE CASCADE,
  referencia text NOT NULL CHECK (char_length(btrim(referencia)) BETWEEN 5 AND 300),
  observacion text NOT NULL CHECK (char_length(btrim(observacion)) BETWEEN 10 AND 1200),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cimat_10_ia_ejecuciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrevista_id uuid NOT NULL REFERENCES public.cimat_087_entrevistas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consentimiento_version text NOT NULL CHECK (consentimiento_version='cimat-1.0-beta-1'),
  proveedor text NOT NULL DEFAULT 'gemini',
  modelo text NOT NULL,
  caracteres_enviados integer NOT NULL CHECK (caracteres_enviados BETWEEN 0 AND 35000),
  estado text NOT NULL CHECK (estado IN ('iniciada','completada','fallida')),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cimat_10_seguimientos_idx ON public.cimat_10_seguimientos(entrevista_id,creado_en);
CREATE INDEX cimat_10_hallazgos_idx ON public.cimat_10_hallazgos(entrevista_id,estado);
CREATE INDEX cimat_10_relaciones_idx ON public.cimat_10_relaciones(entrevista_id);
CREATE INDEX cimat_10_contrastes_idx ON public.cimat_10_contrastes(entrevista_id);
CREATE INDEX cimat_10_ia_idx ON public.cimat_10_ia_ejecuciones(usuario_id,creado_en DESC);

ALTER TABLE public.cimat_10_seguimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_10_hallazgos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_10_relaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_10_contrastes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cimat_10_ia_ejecuciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cimat_10_seguimientos,public.cimat_10_hallazgos,
 public.cimat_10_relaciones,public.cimat_10_contrastes,
 public.cimat_10_ia_ejecuciones FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cimat_10_seguimientos,public.cimat_10_hallazgos TO authenticated;
GRANT SELECT,INSERT ON public.cimat_10_relaciones,public.cimat_10_contrastes TO authenticated;
GRANT SELECT ON public.cimat_10_ia_ejecuciones TO authenticated;

CREATE POLICY c10_seguimientos_leer ON public.cimat_10_seguimientos
 FOR SELECT TO authenticated USING (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_seguimientos_crear ON public.cimat_10_seguimientos
 FOR INSERT TO authenticated WITH CHECK (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid()) AND s.estado='en_curso'));
CREATE POLICY c10_seguimientos_editar ON public.cimat_10_seguimientos
 FOR UPDATE TO authenticated USING (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid()) AND s.estado='en_curso'))
 WITH CHECK (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid()) AND s.estado='en_curso'));

CREATE POLICY c10_hallazgos_leer ON public.cimat_10_hallazgos
 FOR SELECT TO authenticated USING (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_hallazgos_crear ON public.cimat_10_hallazgos
 FOR INSERT TO authenticated WITH CHECK (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_hallazgos_editar ON public.cimat_10_hallazgos
 FOR UPDATE TO authenticated USING (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())))
 WITH CHECK (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));

CREATE POLICY c10_relaciones_leer ON public.cimat_10_relaciones
 FOR SELECT TO authenticated USING (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_relaciones_crear ON public.cimat_10_relaciones
 FOR INSERT TO authenticated WITH CHECK (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_contrastes_leer ON public.cimat_10_contrastes
 FOR SELECT TO authenticated USING (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_contrastes_crear ON public.cimat_10_contrastes
 FOR INSERT TO authenticated WITH CHECK (EXISTS
 (SELECT 1 FROM public.cimat_087_entrevistas s WHERE s.id=entrevista_id AND s.usuario_id=(SELECT auth.uid())));
CREATE POLICY c10_ia_leer ON public.cimat_10_ia_ejecuciones
 FOR SELECT TO authenticated USING (usuario_id=(SELECT auth.uid()));

-- El servidor valida vinculos y citas exactas, no confia en la UI.
CREATE FUNCTION public.cimat_10_validar_seguimiento()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND
   (NEW.id IS DISTINCT FROM OLD.id OR NEW.entrevista_id IS DISTINCT FROM OLD.entrevista_id
   OR NEW.pregunta_id IS DISTINCT FROM OLD.pregunta_id OR NEW.pregunta IS DISTINCT FROM OLD.pregunta
   OR NEW.senal IS DISTINCT FROM OLD.senal OR NEW.creado_en IS DISTINCT FROM OLD.creado_en) THEN
   RAISE EXCEPTION 'La pregunta de seguimiento no puede reasignarse.';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.cimat_087_entrevistas s
  JOIN public.cimat_086_cuestionarios c ON c.id=s.cuestionario_id,
    LATERAL jsonb_array_elements(c.preguntas) q(p)
  WHERE s.id=NEW.entrevista_id AND s.usuario_id=(SELECT auth.uid())
   AND s.estado='en_curso' AND q.p->>'id'=NEW.pregunta_id AND q.p->>'habilitada'='true'
 ) THEN RAISE EXCEPTION 'Pregunta base inexistente o sesión no editable.'; END IF;
 NEW.actualizado_en=clock_timestamp();
 RETURN NEW;
END; $$;
CREATE TRIGGER c10_seguimiento_guard BEFORE INSERT OR UPDATE ON public.cimat_10_seguimientos
 FOR EACH ROW EXECUTE FUNCTION public.cimat_10_validar_seguimiento();

CREATE FUNCTION public.cimat_10_validar_hallazgo()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE original_text text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.entrevista_id IS DISTINCT FROM OLD.entrevista_id
     OR NEW.id IS DISTINCT FROM OLD.id OR NEW.pregunta_id IS DISTINCT FROM OLD.pregunta_id
     OR NEW.seguimiento_id IS DISTINCT FROM OLD.seguimiento_id
     OR NEW.origen IS DISTINCT FROM OLD.origen
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en) THEN
   RAISE EXCEPTION 'No puedes reasignar una evidencia.';
 END IF;
 IF NEW.pregunta_id IS NOT NULL THEN
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
CREATE TRIGGER c10_hallazgo_guard BEFORE INSERT OR UPDATE ON public.cimat_10_hallazgos
 FOR EACH ROW EXECUTE FUNCTION public.cimat_10_validar_hallazgo();

CREATE FUNCTION public.cimat_10_validar_relacion()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.cimat_10_hallazgos a JOIN public.cimat_10_hallazgos b
 ON b.id=NEW.destino_id WHERE a.id=NEW.origen_id AND a.entrevista_id=NEW.entrevista_id
 AND b.entrevista_id=NEW.entrevista_id AND a.estado='confirmado' AND b.estado='confirmado')
 THEN RAISE EXCEPTION 'Relaciona únicamente hallazgos confirmados de la misma entrevista.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER c10_relacion_guard BEFORE INSERT ON public.cimat_10_relaciones
 FOR EACH ROW EXECUTE FUNCTION public.cimat_10_validar_relacion();

CREATE FUNCTION public.cimat_10_validar_contraste()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.cimat_10_hallazgos h
 WHERE h.id=NEW.hallazgo_id AND h.entrevista_id=NEW.entrevista_id AND h.estado='confirmado')
 THEN RAISE EXCEPTION 'Contrasta únicamente hallazgos confirmados.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER c10_contraste_guard BEFORE INSERT ON public.cimat_10_contrastes
 FOR EACH ROW EXECUTE FUNCTION public.cimat_10_validar_contraste();

REVOKE ALL ON FUNCTION public.cimat_10_validar_seguimiento(),public.cimat_10_validar_hallazgo(),
 public.cimat_10_validar_relacion(),public.cimat_10_validar_contraste() FROM PUBLIC;
COMMENT ON TABLE public.cimat_10_hallazgos IS
 'Hipotesis con evidencia textual literal; no son hechos validados hasta revision humana.';
COMMENT ON TABLE public.cimat_10_contrastes IS
 'Comparaciones manuales posteriores; no se infiere incumplimiento normativo automaticamente.';
