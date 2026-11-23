-- CIMAT 0.8.7 — refuerzo de privacidad y autorizacion.
-- Mover el acceso privilegiado a un esquema no expuesto.
CREATE OR REPLACE FUNCTION private.cimat_087_puede_entrevistarse()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      private.es_administrador_plataforma()
      OR EXISTS (
        SELECT 1 FROM public.usuario_empresa_rol AS u
        JOIN public.roles AS r ON r.id=u.rol_id
        JOIN public.empresas AS e ON e.id=u.empresa_id
        WHERE u.usuario_id = (SELECT auth.uid())
          AND u.activo IS TRUE AND e.activa IS TRUE
          AND r.nombre = 'entrevistado'
      )
    );
$$;
REVOKE ALL ON FUNCTION private.cimat_087_puede_entrevistarse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cimat_087_puede_entrevistarse() TO authenticated;

CREATE OR REPLACE FUNCTION public.cimat_087_puede_entrevistarse()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
 SELECT private.cimat_087_puede_entrevistarse();
$$;
REVOKE ALL ON FUNCTION public.cimat_087_puede_entrevistarse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cimat_087_puede_entrevistarse() TO authenticated;

-- Permitir consultar el instrumento publicado de una entrevista propia
-- aun si el administrador revoca posteriormente el rol del participante.
-- No habilita acceso a respuestas de otras personas.
CREATE POLICY cimat_086_preguntas_entrevista_propia
ON public.cimat_086_cuestionarios
FOR SELECT TO authenticated
USING (
  estado = 'publicado' AND EXISTS (
    SELECT 1 FROM public.cimat_087_entrevistas s
    WHERE s.cuestionario_id = id AND s.usuario_id = (SELECT auth.uid())
  )
);
