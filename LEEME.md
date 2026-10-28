# CIMAT — Plataforma web v0.2.0

Prototipo académico para la extracción de conocimiento y mejora de procesos de software, con referencia a ISO/IEC 29110.

## Estado funcional

- Inicio de sesión con correo y contraseña usando Supabase Auth.
- Consulta de organizaciones asignadas mediante PostgreSQL y Row Level Security (RLS).
- Consulta únicamente de informes consolidados que estén autorizados por la base de datos.
- Panel web con secciones Resumen, Mis empresas, Informes y Mi perfil.
- Edición del nombre y los apellidos propios mediante UPDATE a la tabla `perfiles`, sujeta a permisos por columna y política RLS.
- Se conserva el almacenamiento temporal de la sesión en `sessionStorage`; en esta versión no se renuevan automáticamente los tokens.

## Pendiente de desarrollo

- Panel administrativo para altas y cambios de empresas, usuarios y roles (no habilitado todavía).
- Entrevistas, cuestionarios, integración de IA, extracción de conocimiento, trazabilidad y diagramas.
- Revisión de seguridad integral con varias cuentas y pruebas de confidencialidad de entrevistados.
- Procesos de recuperación de contraseña, administración de sesiones y registro de auditoría de la interfaz.

## Seguridad y privacidad

- El sitio público contiene solamente una clave **publishable** y la URL de Supabase.
- Nunca publicar contraseñas de PostgreSQL, claves `sb_secret_...`, `service_role`, tokens de usuario ni archivos privados.
- Las consultas están controladas por grants y políticas RLS en Supabase: ocultar un elemento visual no otorga ni quita permisos reales.
- RF-SEG-01: el rol Empresa no podrá ver nombres ni respuestas individuales de los entrevistados. Antes de habilitar datos reales hay que evaluar también la reidentificación indirecta en informes.
- Nunca usar información confidencial ni personal real para pruebas del prototipo sin evaluación y autorización previas.
- Si la sesión caduca, cerrar sesión e iniciar nuevamente. No se ha implementado renovación automática.

## Implementación

- `index.html`: estructura de pantallas.
- `styles.css`: presentación adaptable.
- `app.js`: autenticación y consultas REST a Supabase.
- `config.js`: URL y clave pública del proyecto.
- Sin servidor Node.js propio ni bibliotecas JavaScript de terceros para el frontend inicial.
- Publicación: GitHub Pages, rama `main`, carpeta `/(root)`.

## Fuentes oficiales

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Permisos por columna](https://supabase.com/docs/guides/database/postgres/column-level-security)
- [Seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [GitHub Pages](https://docs.github.com/en/pages)
