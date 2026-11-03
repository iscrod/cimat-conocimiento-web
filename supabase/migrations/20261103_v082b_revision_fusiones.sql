-- CIMAT 0.8.2b: aplicar una sola vez después del modelo 0.8.1.
-- Revisión documentada y fusiones reversibles (sin borrado de evidencias).
CREATE TABLE public.conocimiento_fusiones(
 fuente_id uuid PRIMARY KEY,
 dominio_id uuid NOT NULL,
 canonico_id uuid NOT NULL,
 motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 12 AND 1000),
 creado_por uuid NOT NULL REFERENCES auth.users(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fusion_diferente CHECK (fuente_id<>canonico_id),
 FOREIGN KEY (dominio_id,fuente_id) REFERENCES public.conocimiento_elementos(dominio_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (dominio_id,canonico_id) REFERENCES public.conocimiento_elementos(dominio_id,id) ON DELETE RESTRICT
);
CREATE INDEX conocimiento_fusiones_canonico ON public.conocimiento_fusiones(dominio_id,canonico_id);
CREATE TABLE public.conocimiento_revisiones(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 dominio_id uuid NOT NULL REFERENCES public.dominios_conocimiento(id) ON DELETE RESTRICT,
 elemento_id uuid REFERENCES public.conocimiento_elementos(id) ON DELETE RESTRICT,
 relacion_id uuid REFERENCES public.conocimiento_relaciones(id) ON DELETE RESTRICT,
 accion text NOT NULL CHECK(accion IN ('reclasificar','aprobar','descartar','restablecer','fusionar','deshacer_fusion')),
 anterior jsonb NOT NULL,
 posterior jsonb NOT NULL,
 motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 12 AND 1000),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT una_entidad_review CHECK ((elemento_id IS NOT NULL) <> (relacion_id IS NOT NULL))
);
CREATE INDEX conocimiento_revisiones_dominio_fecha ON public.conocimiento_revisiones(dominio_id,creado_en DESC);
ALTER TABLE public.conocimiento_fusiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conocimiento_revisiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conocimiento_fusiones,public.conocimiento_revisiones FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.conocimiento_fusiones TO authenticated;
GRANT SELECT,INSERT ON public.conocimiento_revisiones TO authenticated;
CREATE POLICY "Admin lee fusiones" ON public.conocimiento_fusiones FOR SELECT TO authenticated
 USING ((SELECT private.es_administrador_plataforma()));
CREATE POLICY "Admin registra fusiones" ON public.conocimiento_fusiones FOR INSERT TO authenticated
 WITH CHECK ((SELECT private.es_administrador_plataforma()) AND creado_por=(SELECT auth.uid()));
CREATE POLICY "Admin deshace fusiones" ON public.conocimiento_fusiones FOR DELETE TO authenticated
 USING ((SELECT private.es_administrador_plataforma()));
CREATE POLICY "Admin lee revisiones" ON public.conocimiento_revisiones FOR SELECT TO authenticated
 USING ((SELECT private.es_administrador_plataforma()));
CREATE POLICY "Admin registra revisiones" ON public.conocimiento_revisiones FOR INSERT TO authenticated
 WITH CHECK ((SELECT private.es_administrador_plataforma()) AND actor_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.cimat_082b_revisar(p_entidad text, p_id uuid, p_accion text, p_motivo text, p_nuevo_tipo text DEFAULT NULL::text, p_destino uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := auth.uid();
 v_admin boolean;
 v_actual public.conocimiento_elementos%ROWTYPE;
 v_destino public.conocimiento_elementos%ROWTYPE;
 v_rel public.conocimiento_relaciones%ROWTYPE;
 v_fusion public.conocimiento_fusiones%ROWTYPE;
 v_antes jsonb;
 v_despues jsonb;
 v_dominio uuid;
 v_result jsonb;
BEGIN
 v_admin := private.es_administrador_plataforma();
 IF v_user IS NULL OR v_admin IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Acceso denegado: solo administradores globales';
 END IF;
 IF p_id IS NULL OR p_entidad NOT IN ('elemento','relacion') OR
    p_accion NOT IN ('reclasificar','aprobar','descartar','restablecer','fusionar','deshacer_fusion') OR
    p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 12 AND 1000 THEN
  RAISE EXCEPTION 'Solicitud inválida: identifica la entidad, acción y motivo (12 a 1000 caracteres)';
 END IF;
 IF p_entidad='elemento' THEN
  SELECT * INTO v_actual FROM public.conocimiento_elementos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Elemento inexistente o sin acceso'; END IF;
  v_dominio:=v_actual.dominio_id;
  v_antes:=to_jsonb(v_actual);
  IF p_accion='reclasificar' THEN
    IF v_actual.estado='aprobado' THEN RAISE EXCEPTION 'Primero devuelve el elemento aprobado a propuesto'; END IF;
    IF EXISTS(SELECT 1 FROM public.conocimiento_fusiones WHERE fuente_id=p_id) THEN
      RAISE EXCEPTION 'Primero deshaz la consolidación de esta ficha';
    END IF;
    IF p_nuevo_tipo NOT IN ('proceso','actividad','tarea','rol','producto','componente','concepto') OR p_nuevo_tipo=v_actual.tipo THEN
      RAISE EXCEPTION 'Selecciona una categoría diferente y válida';
    END IF;
    UPDATE public.conocimiento_elementos SET tipo=p_nuevo_tipo WHERE id=p_id;
    SELECT to_jsonb(e) INTO v_despues FROM public.conocimiento_elementos e WHERE id=p_id;
  ELSIF p_accion IN ('aprobar','descartar','restablecer') THEN
    IF EXISTS(SELECT 1 FROM public.conocimiento_fusiones WHERE fuente_id=p_id) THEN
      RAISE EXCEPTION 'Esta ficha está consolidada en otra; deshaz la fusión antes de cambiar su estado';
    END IF;
    IF p_accion='aprobar' THEN
      IF v_actual.estado='aprobado' THEN RAISE EXCEPTION 'Ya está aprobada'; END IF;
      IF v_actual.documento_id IS NULL OR v_actual.pagina IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.conocimiento_evidencias ev
        WHERE ev.elemento_id=p_id AND ev.dominio_id=v_dominio
          AND ev.documento_id=v_actual.documento_id AND length(btrim(ev.cita))>=15
      ) THEN RAISE EXCEPTION 'No puede aprobarse sin fuente y una cita registrada. Verifica el PDF'; END IF;
    END IF;
    UPDATE public.conocimiento_elementos
      SET estado=CASE p_accion WHEN 'aprobar' THEN 'aprobado' WHEN 'descartar' THEN 'descartado' ELSE 'propuesto' END
      WHERE id=p_id;
    SELECT to_jsonb(e) INTO v_despues FROM public.conocimiento_elementos e WHERE id=p_id;
  ELSIF p_accion='fusionar' THEN
    IF p_destino IS NULL OR p_destino=p_id THEN RAISE EXCEPTION 'Selecciona otra ficha canónica'; END IF;
    SELECT * INTO v_destino FROM public.conocimiento_elementos WHERE id=p_destino FOR UPDATE;
    IF NOT FOUND OR v_destino.dominio_id<>v_dominio OR v_destino.tipo<>v_actual.tipo THEN
       RAISE EXCEPTION 'Solo se pueden consolidar fichas del mismo dominio y categoría';
    END IF;
    IF v_actual.estado<>'propuesto' OR v_destino.estado<>'propuesto' THEN
      RAISE EXCEPTION 'Para consolidar ambas fichas deben permanecer propuestas';
    END IF;
    IF EXISTS (SELECT 1 FROM public.conocimiento_fusiones
       WHERE fuente_id IN (p_id,p_destino) OR canonico_id=p_id) THEN
      RAISE EXCEPTION 'Fusión incompatible con otra consolidación; evita cadenas y ciclos';
    END IF;
    INSERT INTO public.conocimiento_fusiones(fuente_id,dominio_id,canonico_id,motivo,creado_por)
      VALUES(p_id,v_dominio,p_destino,btrim(p_motivo),v_user);
    v_despues:=jsonb_build_object('fusionado_en',p_destino,'elemento',to_jsonb(v_actual),'canonico',to_jsonb(v_destino));
  ELSIF p_accion='deshacer_fusion' THEN
    SELECT * INTO v_fusion FROM public.conocimiento_fusiones WHERE fuente_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La ficha no figura como fusionada'; END IF;
    DELETE FROM public.conocimiento_fusiones WHERE fuente_id=p_id;
    v_despues:=jsonb_build_object('fusion_revertida',true,'canonico_anterior',v_fusion.canonico_id,'elemento',to_jsonb(v_actual));
  ELSE RAISE EXCEPTION 'Acción no válida para elementos'; END IF;
  INSERT INTO public.conocimiento_revisiones(dominio_id,elemento_id,accion,anterior,posterior,motivo,actor_id)
    VALUES(v_dominio,p_id,p_accion,v_antes,v_despues,btrim(p_motivo),v_user);
 ELSIF p_entidad='relacion' THEN
  IF p_accion NOT IN ('aprobar','descartar','restablecer') THEN
    RAISE EXCEPTION 'Para una relación solo es posible aprobar, descartar o restablecer';
  END IF;
  SELECT * INTO v_rel FROM public.conocimiento_relaciones WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relación inexistente o sin acceso'; END IF;
  v_dominio:=v_rel.dominio_id;v_antes:=to_jsonb(v_rel);
  IF p_accion='aprobar' THEN
    IF v_rel.estado='aprobado' THEN RAISE EXCEPTION 'La relación ya está aprobada'; END IF;
    IF v_rel.documento_id IS NULL OR v_rel.pagina IS NULL OR
      position('Cita literal:' in coalesce(v_rel.detalle,''))=0 THEN
      RAISE EXCEPTION 'La relación requiere documento, página y cita literal comprobada'; END IF;
    IF EXISTS(SELECT 1 FROM public.conocimiento_elementos e
       WHERE e.id IN (v_rel.origen_id,v_rel.destino_id) AND e.estado='descartado') THEN
      RAISE EXCEPTION 'La relación menciona elementos descartados'; END IF;
  END IF;
  UPDATE public.conocimiento_relaciones
    SET estado=CASE p_accion WHEN 'aprobar' THEN 'aprobado' WHEN 'descartar' THEN 'descartado' ELSE 'propuesto' END
    WHERE id=p_id;
  SELECT to_jsonb(r) INTO v_despues FROM public.conocimiento_relaciones r WHERE id=p_id;
  INSERT INTO public.conocimiento_revisiones(dominio_id,relacion_id,accion,anterior,posterior,motivo,actor_id)
    VALUES(v_dominio,p_id,p_accion,v_antes,v_despues,btrim(p_motivo),v_user);
 END IF;
 RETURN jsonb_build_object('ok',true,'accion',p_accion,'entidad',p_entidad,'id',p_id,'dominio_id',v_dominio);
END $function$
;

REVOKE ALL ON FUNCTION public.cimat_082b_revisar(text,uuid,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cimat_082b_revisar(text,uuid,text,text,text,uuid) TO authenticated;

-- Regla de integridad: no permitir fusiones distintas de la clase o dominio
-- ni encadenamientos, incluso ante inserciones administrativas fuera de la interfaz.
CREATE FUNCTION private.cimat_082b_validar_fusion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE original public.conocimiento_elementos%ROWTYPE;
        canon public.conocimiento_elementos%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Las fusiones no se editan: deshaz y registra otra decisión'; END IF;
 SELECT * INTO original FROM public.conocimiento_elementos
 WHERE id=NEW.fuente_id AND dominio_id=NEW.dominio_id;
 SELECT * INTO canon FROM public.conocimiento_elementos
 WHERE id=NEW.canonico_id AND dominio_id=NEW.dominio_id;
 IF original.id IS NULL OR canon.id IS NULL OR original.tipo<>canon.tipo
    OR original.estado<>'propuesto' OR canon.estado<>'propuesto' THEN
   RAISE EXCEPTION 'Solo se consolidan elementos propuestos, del mismo dominio y categoría';
 END IF;
 IF EXISTS(SELECT 1 FROM public.conocimiento_fusiones f
    WHERE f.fuente_id=NEW.canonico_id OR f.canonico_id=NEW.fuente_id) THEN
   RAISE EXCEPTION 'No se permiten fusiones encadenadas o ciclos';
 END IF;
 NEW.creado_por:=auth.uid();
 RETURN NEW;
END $$;
CREATE TRIGGER conocimiento_validar_fusion
 BEFORE INSERT OR UPDATE ON public.conocimiento_fusiones
 FOR EACH ROW EXECUTE FUNCTION private.cimat_082b_validar_fusion();
