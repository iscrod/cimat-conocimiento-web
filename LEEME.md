# CIMAT - Aplicación web 0.1

Prototipo estático (sin servidor Node ni compilación) con acceso Supabase Auth, consulta de perfil, empresas autorizadas e informes consolidados aprobados.

## Pasos para publicar
1. Crea un repositorio de GitHub para el prototipo. No subas claves privadas, datos reales ni información confidencial.
2. Sube los archivos de esta carpeta (NO el ZIP directamente).
3. En Supabase -> Project Settings -> API Keys copia únicamente la clave **publishable** (`sb_publishable_...`). Copia la Project URL desde Project Settings.
4. Edita `config.js` con esos dos valores. La URL y la clave publishable son credenciales públicas; la seguridad depende de RLS y los permisos SQL. **Jamás** pegar `service_role`, `sb_secret_...` o contraseña de PostgreSQL.
5. En GitHub: Settings -> Pages -> Deploy from a branch -> main -> /(root). Esto publica el prototipo bajo https://USUARIO.github.io/REPOSITORIO/.
6. En Supabase: Authentication -> URL Configuration, añade la URL publicada a las Redirect URLs. Revisa Site URL si utilizarás confirmación o recuperación de contraseñas.
7. Inicia sesión con el usuario de prueba que ya creaste.

## Restricciones
- El sistema NO ofrece registro público, administración, entrevistas ni edición: son siguientes etapas.
- `informes_empresa` debe mantener su política de acceso y solo contener contenido revisado y autorizado, sin datos que permitan reidentificar personas.
- La app usa un módulo JavaScript de CDN; se necesita Internet para cargarlo. Más adelante se sustituirá por dependencia empaquetada y bloqueada con lockfile antes de producción.
- Para pruebas académicas sin datos personales reales. Revisa permisos y políticas con varios usuarios antes de cualquier uso con empresas reales.
- Si un usuario inicia sesión y ve 'Sin permiso', esto NO se soluciona desactivando RLS: se revisan grants y políticas específicas.

Fuentes oficiales:
https://supabase.com/docs/guides/auth
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/api/securing-your-api
https://docs.github.com/en/pages
