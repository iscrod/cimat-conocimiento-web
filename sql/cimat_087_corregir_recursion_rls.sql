-- CIMAT 0.8.7 - Correccion de recursion RLS entre cuestionarios y entrevistas.
-- El usuario solo puede consultar cuestionarios publicados que haya utilizado
-- en sus propias entrevistas, incluso si posteriormente pierde el rol.
--
-- El helper esta en un esquema no expuesto y se ejecuta con el propietario
-- de la base de datos para consultar exclusivamente la relacion de pertenencia
-- sin re-entrar a la politica RLS de cimat_087_entrevistas.
CREATE OR REPLACE FUNCTION private.cimat_087_tiene_cuestionario_propio(
    p_cuestionario_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $func$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND p_cuestionario_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.cimat_087_entrevistas AS e
       WHERE e.cuestionario_id = p_cuestionario_id
         AND e.usuario_id = (SELECT auth.uid())
     );
$func$;

REVOKE ALL ON FUNCTION private.cimat_087_tiene_cuestionario_propio(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cimat_087_tiene_cuestionario_propio(uuid)
  TO authenticated;

DROP POLICY IF EXISTS cimat_086_preguntas_entrevista_propia
  ON public.cimat_086_cuestionarios;

CREATE POLICY cimat_086_preguntas_entrevista_propia
  ON public.cimat_086_cuestionarios
  FOR SELECT TO authenticated
  USING (
    estado = 'publicado'
    AND private.cimat_087_tiene_cuestionario_propio(
      cimat_086_cuestionarios.id
    )
  );

COMMENT ON FUNCTION private.cimat_087_tiene_cuestionario_propio(uuid) IS
  'Comprobacion booleana de propiedad de cuestionarios usados en sesiones. '
  'Evita la dependencia circular RLS entre cuestionarios y entrevistas. '
  'No devuelve identidades, entrevistas ni respuestas.';
