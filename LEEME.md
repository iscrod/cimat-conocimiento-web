# CIMAT v0.8.1 — Análisis integral por una sola operación

## Implementación

Se añadió **Analizar todo el documento** a `Modelo y diagramas → Propuestas mediante IA`. El usuario selecciona el PDF, marca una autorización específica para enviar el texto completo a Gemini y confirma la ejecución. La interfaz prepara las páginas con texto y procesa **uno o dos folios consecutivos por solicitud**. Esto permite un único inicio manual sin sobrepasar el límite de tiempo por Edge Function.

La función `cimat-analizar-dominio` añade la operación `accion:"plan"`, que **no envía contenido a Gemini**: devuelve únicamente los números de páginas con texto y los previamente completados. No se repiten páginas finalizadas por el mismo modelo durante la reanudación.

Cada tramo pasa por el pipeline v0.8: autenticación y autorización de administrador, consentimiento explícito, extracción limitada del PDF privado, análisis Gemini, comprobación de citas literales, comparación con el catálogo y registro en estado `propuesto`. La comparación evita crear nuevas fichas si coincide el **código canónico** o, para productos y roles, el **nombre normalizado**. Esto mejora la deduplicación exacta, pero NO garantiza la eliminación de duplicados semánticos (sinónimos, traducciones, variantes de edición).

### Nueva trazabilidad

La tabla `conocimiento_evidencias` guarda varias citas y páginas de una misma ficha. Las relaciones existentes y los elementos aprobados **no se reemplazan** ni se fusionan automáticamente. La pestaña **Modelo y diagramas** permite ver las citas de cada elemento y advierte sobre nombres idénticos de productos existentes. Se recuperaron siete citas verificadas de las propuestas anteriores.

### Límites y precauciones

- Supabase Free: 150 s como límite de duración de Edge Functions y 150 s de espera sin respuesta; por eso las solicitudes son breves y secuenciales.
- Gemini 3.5 Flash-Lite: ventana de entrada de 1,048,576 tokens y salida limitada; leer todo en una sola llamada no asegura extraer todas las relaciones.
- No hay trabajos automáticos en segundo plano. Es necesario mantener abierta la pestaña. **Detener** permite terminar el tramo en curso y pausar; al reabrir se consultan las páginas pendientes.
- Gemini puede imponer cuotas por minuto o día y costos según la cuenta; una interrupción detiene el recorrido, sin ejecutar reintentos ciegos. Los resultados completados quedan en PostgreSQL.
- Dos páginas del PDF registrado no tienen texto extraíble: **8 y 53**. No serán analizadas hasta aplicar OCR.
- Antes de transmitir la norma entera a Google, verifica que tu autorización de uso permita esta transferencia. La autorización de subida no equivale a autorización de procesamiento externo.
- Las inferencias se guardan únicamente como propuestas y requieren revisión experta. **No se declara conformidad ni cumplimiento normativo.**

## Estado verificado

Se verificaron las nuevas tablas, las políticas de lectura restringidas, la sintaxis JavaScript del navegador y el despliegue activo de la función. **La ejecución integral sobre el PDF del usuario no se realizó**: requiere consentimiento explícito desde el navegador y validación posterior de calidad.

### Fuentes oficiales

- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Límites de Edge Functions](https://supabase.com/docs/guides/functions/limits)
- [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Precios Gemini](https://ai.google.dev/gemini-api/docs/pricing)

---

# CIMAT v0.8.0 — Análisis inteligente del dominio

Versión inicial del analizador de conocimiento basado en documentos previamente procesados.

## Funciones

- Integra **Google Gemini API** exclusivamente mediante la función de servidor `cimat-analizar-dominio`. La clave privada no se incluye en el navegador ni en GitHub.
- Un administrador global puede elegir de **una a dos páginas consecutivas** de un PDF procesado, y debe confirmar autorización explícita para transmitir esos fragmentos al proveedor externo.
- La IA propone elementos de clase **proceso, actividad, tarea, rol, producto, componente y concepto**, así como relaciones dirigidas compatibles con el modelo v0.7.1.
- La respuesta se valida del lado del servidor: tipos permitidos, página válida, citas textuales de respaldo y referencias de relaciones a elementos reconocidos.
- Los registros se guardan **solo como propuestas**; no se aprueban automáticamente ni demuestran cumplimiento ISO.
- Existe historial de análisis con resultados y descartes para auditoría.
- Los datos que no cumplen los controles de cita se descartan; esto no garantiza por sí solo exactitud semántica, por lo que es obligatoria la revisión humana.
- El archivo original permanece en el bucket privado de Supabase; el proveedor externo recibe únicamente los textos de páginas seleccionadas.

## Configuración pendiente para ejecutar la IA

Crear la clave de API de Gemini en el proveedor y configurarla como **secreto del proyecto Supabase Edge Functions**:

- `CIMAT_GEMINI_API_KEY`: clave privada (nunca escribirla en GitHub ni en el chat).
- `CIMAT_GEMINI_MODEL` (opcional): por defecto `gemini-3.8-flash`, ID estable verificado en la documentación oficial de Gemini.

Después ingresar en CIMAT → Modelo y diagramas → **Propuestas mediante IA** → **Comprobar configuración**.

**Aviso:** el envío de fragmentos de normas o documentación a servicios externos requiere autorización para ese procesamiento, además de revisar sus condiciones de tratamiento de datos y las restricciones de reproducción de las normas. El costo y la disponibilidad dependen de la API y del plan elegido. No usar material confidencial real antes de evaluar el proveedor y la seguridad.

## Limitaciones conocidas

- No se ha comprobado todavía una ejecución real con credenciales del proveedor: el historial de ejecuciones estaba vacío en la revisión inicial.
- Cada solicitud admite máximo dos páginas y 18 000 caracteres, y el modelo puede devolver cero propuestas si carece de evidencia explícita.
- El análisis genera propuestas incrementales; puede no reconstruir procesos completos con una sola solicitud.
- La evaluación de cumplimiento y los cuestionarios inteligentes siguen pendientes.
- RF-SEG-01 sigue vigente: el rol Empresa no puede acceder al material identificable de las entrevistas.

## Recursos oficiales

- [Modelos de Gemini](https://ai.google.dev/gemini-api/docs/models)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Seguridad en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [GitHub Pages](https://docs.github.com/en/pages)
