# CIMAT — Plataforma web v0.4.0

Prototipo académico para extracción de conocimiento y mejora de procesos de software, con referencia a ISO/IEC 29110.

## Funcionalidad implementada

- Inicio de sesión mediante Supabase Auth y consultas protegidas por PostgreSQL RLS.
- Perfil personal: consultar y modificar exclusivamente nombre y apellidos propios.
- Empresas: consultar las autorizadas; el administrador global puede registrar y editar organizaciones.
- Informes: consultar únicamente los consolidados aprobados y autorizados.
- Gestión de usuarios y roles por empresa: el administrador global puede consultar un directorio limitado a 200 cuentas existentes, revisar sus asignaciones, activar o desactivar los roles `entrevistado`, `experto`, `empresa` y `entrenador`.
- Las altas de cuentas nuevas siguen realizándose en **Supabase → Authentication → Users**; no hay un botón web que cree cuentas directamente.
- Los cambios de asignación producen un evento en la tabla `auditoria`.
- El privilegio de administrador global se gestiona aparte; no se concede a través del formulario de roles por empresa.

## Arquitectura de permisos

- El frontend público utiliza exclusivamente la URL y la clave **publishable**.
- `public.usuario_empresa_rol` no dispone de lectura directa desde `authenticated`, y `auth.users` tampoco se expone a la API.
- El administrador utiliza dos RPC expuestas con `SECURITY INVOKER`: `admin_listar_usuarios()` y `admin_guardar_rol()`.
- Cada RPC delega en una función `SECURITY DEFINER` situada en el esquema no expuesto `private`; antes de acceder o modificar datos, comprueba `auth.uid()` y `private.es_administrador_plataforma()`. El esquema `private` no está en la lista de esquemas publicados por Data API.
- Las funciones RPC no están autorizadas para el rol `anon`.
- El rol `empresa` **no** adquiere acceso a este directorio: se le asignará exclusivamente consulta de resultados consolidados aptos para su publicación.
- Es indispensable probar el control con otras cuentas no administrativas antes de utilizar datos reales.

## Restricciones / pendientes

- Todavía no se han implementado invitaciones automáticas, recuperación de contraseñas, registro de participantes desde la aplicación, ni renovación automática de sesiones.
- Los roles `experto` y `entrenador` existen y pueden asignarse, pero sus pantallas y permisos operativos se construirán posteriormente.
- Entrevistas, cuestionarios, extracción mediante IA, evidencia, diagramas y evaluación normativa continúan pendientes.
- RF-SEG-01: las respuestas individuales y nombres de entrevistados deben permanecer protegidos ante el rol Empresa; los informes consolidados deben pasar revisión humana y protección contra reidentificación indirecta.
- No utilizar información confidencial real antes de completar las pruebas de privacidad, autorización y gestión de sesiones.
- La protección contra contraseñas filtradas todavía requiere atención según el analizador de Supabase (puede depender del plan).
- Para el MVP, el directorio administrativo está limitado a 200 cuentas; antes de crecer debe agregarse paginación.

## Publicación

GitHub Pages en la rama `main`, carpeta `/(root)`:
https://iscrod.github.io/cimat-conocimiento-web/

## Documentación oficial

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase funciones y seguridad](https://supabase.com/docs/guides/database/functions)
- [GitHub Pages](https://docs.github.com/en/pages)
