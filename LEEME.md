# CIMAT — Plataforma web v0.7.0

## Extracción documental y revisión de encabezados (nuevo)

Esta entrega introduce la primera fase del procesador documental, de forma **general**: sirve como base para normas y otras metodologías, sin programar las preguntas exclusivamente para ISO/IEC 29110.

1. En **Biblioteca → Procesar y revisar documentos**, seleccionar un documento PDF ya cargado.
2. Pulsar **Procesar PDF**. La Edge Function \`cimat-procesar-documento\` verifica la sesión y el permiso de administrador global, descarga el documento de Storage privado, verifica la huella SHA-256, extrae texto con \`unpdf@1.8.1\` y registra cada página en \`documento_paginas\`.
3. El motor detecta encabezados **candidatos**, principalmente de numeración decimal y algunos identificadores abreviados. Los almacena en \`documento_secciones\` asociados con la página PDF de origen.
4. El responsable revisa el texto original por página, puede corregir el título e indicar **Aprobado, Descartado o Pendiente**. La función \`revisar_seccion\` valida administrativamente cada cambio y registra auditoría.
5. El resumen de extracción se conserva en \`documento_analisis\`. El sistema no recalcula automáticamente un documento ya procesado, para no sobrescribir revisiones existentes.

### Restricciones de esta fase

- El analizador inicial admite **solo PDF** de hasta **4 MB y 200 páginas**; el módulo de carga sigue admitiendo PDF, DOCX y TXT de hasta 20 MB. Se ampliará en versiones siguientes.
- No incluye OCR, identificación semántica con IA, clasificación definitiva de procesos/actividades/tareas ni evaluación automática de conformidad.
- Los encabezados propuestos no son evidencia normativa validada; pueden contener falsos positivos u omisiones. Cada referencia de página debe cotejarse con el PDF.
- Los textos y las revisiones son **privados** y accesibles únicamente para administración global por RLS. El rol Empresa no tiene acceso.
- **Prueba pendiente:** ejecutar el procesamiento del PDF real con una sesión administrativa desde la página web; el despliegue, las tablas, la sintaxis y las políticas ya fueron comprobados, pero la extracción de ese archivo todavía no se ha validado de extremo a extremo.
- No cargar documentos sin derechos de almacenamiento y procesamiento autorizados.
- La biblioteca y las revisiones no alteran las entrevistas ni los informes empresariales existentes.

### Fuentes y componentes

- Supabase Storage privado y RLS: https://supabase.com/docs/guides/storage y https://supabase.com/docs/guides/database/postgres/row-level-security
- Edge Functions: https://supabase.com/docs/guides/functions
- UnPDF (extracción de texto, biblioteca de código abierto): https://github.com/unjs/unpdf

---

# CIMAT — Archivo de avances v0.6.0

## Biblioteca de conocimiento (nuevo)

La plataforma ahora contiene una biblioteca documental general, separada de las tablas históricas de normas y entrevistas.

- **Dominios**: normas, metodologías, manuales, procedimientos y otros documentos. Cada edición se registra de manera independiente, con título, código, referencia y ámbito general o empresarial.
- **Documentos**: carga privada de PDF, DOCX y TXT de hasta 20 MB al bucket existente `cimat-privado` bajo `dominios/<id>/<archivo>`.
- **Registro documental**: origen, nombre, tipo MIME, tamaño, hash SHA-256 y declaración de uso autorizado.
- **Autorización**: solamente el administrador global puede registrar dominios, cargar archivos y descargarlos; las políticas RLS y Storage se aplican desde PostgreSQL. Los usuarios ordinarios y el rol Empresa no pueden consultar esta biblioteca.
- **Sin IA por ahora**: almacenar el archivo no significa entrenar un modelo, procesar el documento ni validar procesos; esa será la siguiente fase después de definir el esquema de extracción.

### Prueba inicial

1. Inicia sesión como administrador global en https://iscrod.github.io/cimat-conocimiento-web/.
2. Abre la pestaña **Biblioteca** y registra un dominio ficticio (tipo, título, versión y referencia).
3. Adjunta un documento de prueba propio, no protegido por terceros, de menos de 20 MB.
4. Verifica que aparezca en la lista y se pueda descargar.
5. No utilices documentos internos reales o normas con derechos restringidos sin autorización.

### Restricciones conocidas

- Por ahora el acceso a la biblioteca es exclusivamente administrativo; falta la vista de experto con lectura autorizada por dominio.
- No hay extracción de texto, indexación semántica, lectura de imágenes ni generación de cuestionarios.
- Si el archivo se carga pero falla el registro de la ficha, puede quedar un archivo huérfano en Storage y requerir limpieza manual.
- El catálogo de dominios admite los primeros 200 registros y 200 documentos; necesitará paginación antes de crecer.
- Las versiones nuevas se agregan como registros separados. No sobrescribimos archivos anteriores.

## Estado anterior


Prototipo académico para extracción de conocimiento y mejora de procesos de software, con referencia a ISO/IEC 29110.

## Funcionalidad implementada

- Inicio de sesión mediante Supabase Auth y consultas protegidas por PostgreSQL RLS.
- Perfil personal: consultar y modificar exclusivamente nombre y apellidos propios.
- Empresas: consultar las autorizadas; el administrador global puede registrar y editar organizaciones.
- Informes: consultar únicamente los consolidados aprobados y autorizados.
- Gestión de usuarios y roles por empresa: el administrador global puede consultar un directorio limitado a 200 cuentas existentes, revisar sus asignaciones, activar o desactivar los roles `entrevistado`, `experto`, `empresa` y `entrenador`.
- Un administrador global puede **enviar invitaciones por correo desde CIMAT** mediante la Edge Function `cimat-invitar-usuario`. El invitado completa una pantalla para elegir su contraseña; su correo debe quedar confirmado.
- Las nuevas cuentas pueden crearse alternativamente desde **Supabase → Authentication → Users**. La asignación de empresa y rol se realiza por separado **después** de aceptar la invitación.
- Los cambios de asignación producen un evento en la tabla `auditoria`.
- El privilegio de administrador global se gestiona aparte; no se concede a través del formulario de roles por empresa.

## Invitaciones

1. Inicia sesión con una cuenta de administrador global.
2. En **Administración → Invitar un participante**, escribe su correo, nombre y apellidos.
3. Haz clic en **Enviar invitación**. La aplicación llama a una Supabase Edge Function con el JWT de la sesión.
4. La función valida el JWT con Supabase Auth y comprueba la autorización global mediante la RPC de PostgreSQL. Solo entonces usa la clave `service_role` **del entorno de servidor**, nunca desde GitHub.
5. El invitado recibe un enlace de Supabase, llega al sitio y define una contraseña. El fragmento con token se elimina inmediatamente de la URL del navegador; no se almacena en GitHub ni se registra en el servidor del sitio.
6. Una vez confirmada la cuenta, el administrador asigna la empresa y el rol desde **Usuarios y roles por empresa**.

Los límites de correo del plan de Supabase pueden impedir invitaciones sucesivas. Nunca compartir enlaces de invitación porque contienen tokens temporales.

## Arquitectura de permisos

- El frontend público utiliza exclusivamente la URL y la clave **publishable**. La función de invitaciones utiliza secretos de Supabase configurados en su entorno seguro.
- `public.usuario_empresa_rol` no dispone de lectura directa desde `authenticated`, y `auth.users` tampoco se expone a la API.
- El administrador utiliza dos RPC expuestas con `SECURITY INVOKER`: `admin_listar_usuarios()` y `admin_guardar_rol()`.
- Cada RPC delega en una función `SECURITY DEFINER` situada en el esquema no expuesto `private`; antes de acceder o modificar datos, comprueba `auth.uid()` y `private.es_administrador_plataforma()`. El esquema `private` no está en la lista de esquemas publicados por Data API.
- Las funciones RPC no están autorizadas para el rol `anon`.
- El rol `empresa` **no** adquiere acceso a este directorio: se le asignará exclusivamente consulta de resultados consolidados aptos para su publicación.
- Es indispensable probar el control con otras cuentas no administrativas antes de utilizar datos reales.

## Restricciones / pendientes

- Las invitaciones son manuales y requieren que el administrador introduzca un correo válido. No se ha implementado recuperación de contraseñas, invitación masiva, autorregistro público ni renovación automática de sesiones.
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
