-- CIMAT 1.0.0-beta.2 — Restaurar privilegios del backend de chat.
-- Las tablas contienen datos privados. Las claves service_role se usan exclusivamente
-- en funciones Edge y NUNCA se exponen en el navegador.
-- Los usuarios authenticated siguen aislados por RLS y no pueden insertar
-- directamente mensajes generados por la IA.
GRANT SELECT, INSERT, UPDATE ON TABLE public.cimat_11_dialogos TO service_role;
GRANT SELECT ON TABLE public.cimat_12_catalogo TO service_role;
-- No se conceden permisos adicionales a anon ni a authenticated.
