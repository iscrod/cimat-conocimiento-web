# CIMAT 1.0.0-beta.2 — Actualización de modelos Gemini

**Incidencia:** el entrevistador conversacional mostraba «El modelo de IA no está disponible». La función Edge interpretaba así un HTTP 404 recibido del proveedor durante `generateContent`.

## Diagnóstico

La función `cimat-entrevista-chat` tenía como modelo predeterminado `gemini-2.5-flash`. Google ha comunicado restricciones de disponibilidad de los modelos Gemini 2.5 y recomienda migrar a modelos recientes Gemini 3. La configuración opcional `CIMAT_GEMINI_MODEL` puede contener un modelo distinto.

## Corrección

Código: `supabase/functions/cimat-entrevista-chat/index.ts`.

1. El modelo por defecto se actualizó a `gemini-3.8-flash`. Se conserva la opción segura de definir `CIMAT_GEMINI_MODEL` mediante secreto del servidor.
2. Si `generateContent` devuelve 404, el backend llama a `GET /v1beta/models` **usando la clave del proyecto exclusivamente desde Supabase**.
3. Filtra modelos de texto Gemini 3 que anuncian `generateContent`, excluye modelos de imágenes, audio, Live y embeddings y prueba hasta tres alternativas ordenadas, deteniéndose al obtener cualquier respuesta distinta de 404.
4. El turno completado almacena el **identificador real** del modelo utilizado.
5. Se distinguen en los mensajes de error el 404 de modelo, 429 de cuota, 401/403 de credencial o acceso y 400 de configuración. No se incluyen en los logs claves API, entradas del entrevistado ni respuestas privadas del proveedor.
6. La lógica de consentimiento, aislamiento de entrevistas por usuario, extracción trazable y Biblioteca permanece sin modificar.

## Verificación

- La función Edge `cimat-entrevista-chat` se desplegó como **versión 7** y aparece `ACTIVE` en Supabase.
- El código implementado en GitHub coincide con el de la función desplegada.
- No se modificaron datos personales, entrevistas anteriores, tablas ni políticas RLS.
- **Pendiente:** prueba de extremo a extremo con una sesión real del proyecto y respuesta exitosa del proveedor. El listado de modelos anuncia capacidad de generación, pero no garantiza acceso a cada modelo para todos los proyectos.

Si una petición nueva falla, consultar los logs de la función Edge; ahora registran el estado HTTP y el nombre del modelo sin registrar el mensaje privado.

## Referencias técnicas oficiales

- Google, *Models API* — lista de modelos y `supportedGenerationMethods`: https://ai.google.dev/api/models
- Google AI Developers, *Modelos Gemini*: https://ai.google.dev/gemini-api/docs/models
- Supabase, *Edge Functions*: https://supabase.com/docs/guides/functions

La corrección no convierte la correspondencia normativa en una declaración de cumplimiento; los resultados siguen sujetos a evidencia y revisión humana.
