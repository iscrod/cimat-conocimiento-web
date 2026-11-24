# CIMAT 1.0.0-beta.2 — Corrección de acceso al chat

**Fecha:** 24 de noviembre de 2026.

## Incidencia

El usuario recibió el mensaje «No se pudo verificar el turno.» al intentar continuar una entrevista desde la pestaña **Entrevista con IA**.

El registro de Supabase confirmó una petición HTTP 500 a la función Edge `cimat-entrevista-chat` y un error PostgreSQL: `permission denied for table cimat_11_dialogos`.

La función Edge valida explícitamente el JWT de la cuenta, verifica la pertenencia de la entrevista y usa un cliente backend con credenciales `service_role` para recuperar y escribir el historial. Sin embargo, una configuración anterior había retirado los privilegios de tabla necesarios a ese rol: `service_role` no podía hacer SELECT, INSERT ni UPDATE en `cimat_11_dialogos`. Tampoco podía hacer SELECT en `cimat_12_catalogo`, requerido para consultar el índice antes de decidir si ejecutar búsqueda vectorial.

## Cambio aplicado

Migración no destructiva: [`sql/cimat_11_fix_backend_table_grants.sql`](../sql/cimat_11_fix_backend_table_grants.sql).

- Se otorgó `SELECT, INSERT, UPDATE` exclusivamente a `service_role` para `cimat_11_dialogos`.
- Se otorgó `SELECT` exclusivamente a `service_role` para `cimat_12_catalogo`.
- No se dieron permisos nuevos a `anon` o `authenticated`.
- No se modificaron entrevistas, respuestas, modelos normativos, cuestionarios, ni código del entrevistador.

## Evidencia de verificación

Se ejecutó una transacción de prueba reversible con el rol `service_role`:

1. Crear una sesión ficticia provisional.
2. Consultar si un turno ya existe.
3. Insertar un nuevo turno.
4. Actualizarlo a «completado» y leerlo.
5. Consultar el catálogo del índice y ejecutar `cimat_12_buscar_servicio`.
6. Ejecutar `ROLLBACK` para no conservar datos de prueba.

Resultado: **prueba SQL satisfactoria** para lectura, inserción, actualización y búsqueda del índice.

Se comprobaron además los permisos PostgreSQL:
- `anon`: sin lectura, inserción ni actualización.
- `authenticated`: solo lectura por RLS de sus propias conversaciones.
- `service_role`: SELECT/INSERT/UPDATE sobre conversación y SELECT sobre catálogo.

**Pendiente:** prueba de extremo a extremo desde una sesión humana real con llamadas externas a Gemini. Los permisos de base de datos quedaron corregidos, pero el funcionamiento completo del proveedor de IA no se infiere de una prueba SQL.

## Acción del usuario

Recargar la página, acceder a **Entrevista con IA**, seleccionar la sesión existente y reenviar el mensaje que provocó el error si no figura en el historial. No es necesario crear una entrevista nueva.
