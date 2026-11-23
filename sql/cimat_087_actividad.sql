-- CIMAT 0.8.7 — Actualizar fecha de actividad cuando el entrevistado guarda una respuesta.
-- No duplica ni transmite el texto. La sesión sigue protegida por su RLS.
CREATE FUNCTION public.cimat_087_actualizar_actividad()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  UPDATE public.cimat_087_entrevistas
     SET actualizado_en = clock_timestamp()
   WHERE id = NEW.entrevista_id AND estado = 'en_curso';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cimat_087_actualizar_actividad() FROM PUBLIC, anon;
CREATE TRIGGER cimat_087_respuesta_actividad
AFTER INSERT OR UPDATE ON public.cimat_087_respuestas
FOR EACH ROW EXECUTE FUNCTION public.cimat_087_actualizar_actividad();
