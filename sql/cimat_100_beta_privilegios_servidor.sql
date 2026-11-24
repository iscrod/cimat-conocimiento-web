-- CIMAT 1.0.0-beta — privilegios mínimos para Edge Function autenticada.
-- Service role es una credencial SOLO del servidor; nunca se expone en el navegador.
GRANT SELECT ON TABLE
 public.cimat_086_cuestionarios,
 public.cimat_087_entrevistas,
 public.cimat_087_respuestas,
 public.cimat_10_seguimientos
 TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE
 public.cimat_10_ia_ejecuciones
 TO service_role;
-- Ningún cambio para anon ni para las políticas de acceso por propietario.
