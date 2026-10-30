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
