-- CIMAT beta: revisión explícita de coincidencias tentativas.
-- Una revisión nunca equivale a certificación formal de conformidad.
CREATE TABLE public.cimat_11_revisiones (
 dialogo_id uuid NOT NULL REFERENCES public.cimat_11_dialogos(id) ON DELETE CASCADE,
 elemento_id uuid NOT NULL,
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 estado text NOT NULL CHECK(estado IN ('insuficiente','compatible','parcial','no_corresponde')),
 observacion text NOT NULL DEFAULT '' CHECK(length(observacion)<=1600),
 revisado_en timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(dialogo_id,elemento_id)
);
ALTER TABLE public.cimat_11_revisiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cimat_11_revisiones FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cimat_11_revisiones TO authenticated;
CREATE POLICY cimat_11_revisiones_propias_leer
 ON public.cimat_11_revisiones FOR SELECT TO authenticated
 USING (usuario_id=(SELECT auth.uid()));
CREATE POLICY cimat_11_revisiones_propias_insertar
 ON public.cimat_11_revisiones FOR INSERT TO authenticated
 WITH CHECK(usuario_id=(SELECT auth.uid()));
CREATE POLICY cimat_11_revisiones_propias_editar
 ON public.cimat_11_revisiones FOR UPDATE TO authenticated
 USING(usuario_id=(SELECT auth.uid()))
 WITH CHECK(usuario_id=(SELECT auth.uid()));
CREATE FUNCTION public.cimat_11_validar_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.dialogo_id IS DISTINCT FROM OLD.dialogo_id
 OR NEW.elemento_id IS DISTINCT FROM OLD.elemento_id
 OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id) THEN
 RAISE EXCEPTION 'La revisión no puede reasignarse';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.cimat_11_dialogos d,
   LATERAL jsonb_array_elements(d.coincidencias) c(x)
  WHERE d.id=NEW.dialogo_id AND d.usuario_id=(SELECT auth.uid())
    AND (c.x->>'elemento_id')=NEW.elemento_id::text
 ) THEN
  RAISE EXCEPTION 'No se puede revisar una coincidencia ajena o inexistente';
 END IF;
 NEW.revisado_en:=clock_timestamp();
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.cimat_11_validar_revision() FROM PUBLIC,anon;
CREATE TRIGGER cimat_11_revision_guard
 BEFORE INSERT OR UPDATE ON public.cimat_11_revisiones
 FOR EACH ROW EXECUTE FUNCTION public.cimat_11_validar_revision();
COMMENT ON TABLE public.cimat_11_revisiones IS
 'Clasificación de evidencia por el entrevistado sobre posible correspondencia normativa; no acredita cumplimiento.';
