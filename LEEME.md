# CIMAT — Plataforma web v0.8.0

## Nuevo: analizador inteligente del dominio (propuestas)

La v0.8 incorpora la **Supabase Edge Function `cimat-analizar-dominio`** y la interfaz **Modelo y diagramas → Propuestas mediante IA**.

**Qué hace:** examina una o dos páginas de un PDF ya procesado, solicita a Gemini elementos de conocimiento (proceso, actividad, tarea, rol, producto, componente, concepto) y relaciones dirigidas; verifica que cada propuesta contenga una **cita literal presente en la página declarada**. Registra el resultado como `propuesto` con `origen='ia'`, sin modificar ni aprobar elementos previos. Conserva el número de página y el documento.

**Qué no hace:** no analiza automáticamente el PDF completo, no certifica cumplimiento, no sustituye la revisión humana ni garantiza que las inferencias sean correctas por el solo hecho de incluir una cita. Las páginas sin texto requieren OCR previo. El motor es general; no contiene una taxonomía rígida específica de ISO/IEC 29110.

### Activación obligatoria del proveedor de IA

La conexión requiere que el administrador del proyecto establezca en **Supabase Dashboard → Edge Functions → Secrets** el secreto:

- `CIMAT_GEMINI_API_KEY`: una clave de la API de Google Gemini, generada en [Google AI Studio](https://aistudio.google.com/apikey). **Nunca colocar la clave en GitHub, en `config.js` ni en el navegador.**
- `CIMAT_GEMINI_MODEL` (opcional): modelo habilitado en esa cuenta. Por defecto se solicita `gemini-3.7-flash`; si el proveedor devuelve que no existe o no está disponible, configura otro modelo compatible disponible para tu proyecto.

Hasta que el secreto exista, la interfaz indicará **IA no configurada** y no permitirá iniciar análisis externo. El prototipo **no crea cargos por sí mismo**; la facturación y los límites dependen de la cuenta y del modelo configurados con Google. Consulta sus [precios](https://ai.google.dev/gemini-api/docs/pricing).

**Confidencialidad:** antes de enviar cualquier texto al proveedor externo, CIMAT requiere un consentimiento explícito por solicitud. Solo se transmiten las páginas seleccionadas (máximo 18 000 caracteres por ejecución), no el archivo completo. El contenido enviado podría ser utilizado por el proveedor para mejorar sus productos en el nivel gratuito, por lo que **no debes enviar información sensible ni documentos cuya licencia prohíba ese procesamiento**. La autorización para almacenar una norma no equivale necesariamente a autorizar su transmisión externa.

### Ejecución y revisión

1. En **Biblioteca**, procesa el PDF para indexar su texto.
2. En **Modelo y diagramas**, comprueba que el dominio correcto esté seleccionado.
3. En **Propuestas mediante IA**, selecciona el documento y una o dos páginas concretas con contenido relevante, verifica la autorización de transferencia y pulsa **Analizar con IA**.
4. Revisa los nuevos elementos y relaciones en sus respectivas listas. Se muestran inicialmente como `propuesto`; cada elemento conserva la evidencia literal y la página.
5. Antes de aprobar, compara la cita y el significado contra la fuente. La cita literal puede ser correcta y, aun así, la interpretación semántica estar equivocada.
6. El diagrama dinámico permite visualizar propuestas, pero no es un dictamen de cumplimiento.

### Controles técnicos

- **Autorización:** validación del JWT por Supabase Auth y comprobación de administrador global mediante RPC en el servidor.
- **Almacenamiento:** `ia_extracciones` registra metadatos y conteos sin el texto completo ni la clave del proveedor; RLS restringe su lectura a administradores globales.
- **Evidencia:** los elementos y relaciones sin citas literales verificables se descartan antes de guardar.
- **Autoría:** la escritura de propuestas usa el JWT del administrador, sujeto a RLS y a los disparadores de revisión.
- **Tolerancia a errores:** el sistema registra ejecuciones fallidas o parciales y no altera los estados previamente aprobados.
- **Limitaciones:** análisis de dos páginas por solicitud, máx. 12 elementos y 16 relaciones propuestas por llamada; sin procesamiento por lotes ni deduplicación semántica avanzada.
- **Pruebas pendientes:** configurar la clave real, confirmar la respuesta de Gemini, validar contra el PDF y ejecutar pruebas con cuentas no administrativas.

### Referencias oficiales

- [Gemini API — Generate content](https://ai.google.dev/api/generate-content)
- [Gemini API — Precios y tratamiento de datos](https://ai.google.dev/gemini-api/docs/pricing)
- [Supabase Edge Functions — Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

---


Plataforma académica de extracción de conocimiento tácito con **dominios documentales configurables**.

## Estado funcional

- Autenticación, administración global, empresas, usuarios, invitaciones y roles: módulos anteriores.
- Biblioteca privada: registro de dominios documentales y carga de PDF, DOCX y TXT.
- Procesamiento v0.7: extracción de texto PDF por página, detección de encabezados candidatos y revisión.
- **Modelo v0.7.1:** catálogo independiente de la metodología con siete clases: proceso, actividad, tarea, rol, producto de trabajo, componente y concepto.
- Relaciones dirigidas: contiene, participa, ejecuta, utiliza, genera, actualiza, verifica, precede y referencia.
- Trazabilidad de elementos y relaciones hacia dominio, documento y página física del PDF.
- Estados **propuesto / aprobado / descartado** con comprobaciones de fuente y registro de revisión.
- Vista gráfica dinámica: roles a la izquierda, tareas en el centro y productos y componentes a la derecha. Su contenido procede de la base de datos, no de una imagen estática.

## Ejemplo controlado

Para el dominio ISO/IEC TR 29110-5-1-2:2011 se incorporó una muestra de **11 elementos y 10 relaciones** alrededor de la tarea PM.1.1, *Review the Statement of Work* (GP1.1 en el diagrama de referencia del proyecto). Incluye un proceso, una actividad, una tarea, dos roles, dos representaciones de producto y cuatro componentes. **Todo permanece en estado propuesto**, pendiente de verificación frente al PDF cargado. No debe tratarse como extracción semántica automática ni evaluación de conformidad.

## Arquitectura y seguridad

- Tablas `conocimiento_elementos` y `conocimiento_relaciones` en PostgreSQL; separación por `dominio_id`.
- Restricciones de integridad impiden asociar elementos y documentos de distintos dominios o relaciones entre dominios incompatibles.
- RLS: catálogo editable y consultable desde la interfaz solo por administradores globales. No se habilita el catálogo para el rol Empresa.
- Los documentos están almacenados en el bucket privado `cimat-privado`.
- La autoría y revisión se documentan en base de datos; la aprobación **no** equivale a certificación ISO.
- RF-SEG-01 continúa vigente: las identidades y entrevistas no deben exponerse al rol Empresa.

## Cómo probar

1. Abrir [CIMAT](https://iscrod.github.io/cimat-conocimiento-web/) e iniciar sesión como administrador.
2. Ir a **Modelo y diagramas**.
3. Seleccionar el dominio registrado ISO/IEC 29110, edición 2011.
4. Visualizar el ejemplo de planificación del proyecto, revisar las 11 fichas y las 10 relaciones.
5. Antes de aprobar un elemento, abrir el documento en **Biblioteca**, comprobar el contenido y su página original. No aprobar si la evidencia no coincide.
6. Añadir o modificar elementos de prueba para observar cómo cambia el diagrama.

## Pendiente

- Verificación humana de los elementos y de las páginas documentales de la muestra.
- Pruebas de autorización con una cuenta no administrativa y validación visual completa en navegador.
- Extracción semántica automática general (v0.8), interpretaciones de IA con fuentes, propuestas de relaciones y revisión experta.
- Generación de cuestionarios y entrevistas basadas en el modelo de referencia.

## Referencias técnicas oficiales

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [GitHub Pages](https://docs.github.com/en/pages)
