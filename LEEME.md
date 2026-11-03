# CIMAT — v0.8.2a: auditoría del conocimiento (solo lectura)

## Propósito

Esta versión añade **Modelo y diagramas → Auditoría del conocimiento**. Examina el catálogo del dominio seleccionado y señala incidencias antes de aprobar las propuestas de la extracción inteligente. La auditoría **no modifica la base de datos** y **no envía texto a Gemini**; utiliza consultas REST autenticadas sometidas a las políticas RLS existentes de Supabase.

### Comprobaciones

- **Jerarquía:** patrones de códigos para proceso, actividad y tarea del perfil básico ISO/IEC 29110, incluidos conflictos de categoría. Estas reglas solo se habilitan para un dominio cuyo código contiene 29110.
- **Cobertura:** actividades GP.1–GP.4, IS.1–IS.6, actividades sin ficha correcta y saltos en la numeración de tareas. Son **ausencias en el modelo**, no una declaración de incumplimiento de la norma.
- **Duplicados potenciales:** nombres normalizados de la misma categoría. No confunde tareas homónimas con códigos diferentes.
- **Relaciones:** dirección y combinación de tipos sospechosas (p. ej., tarea participa en rol en vez de rol participa en tarea).
- **Trazabilidad:** elementos sin referencia de documento/página o cita registrada; relaciones sin cita o metadatos suficientes.
- **Elementos aislados:** fichas no vinculadas al modelo.

Los avisos se ordenan por prioridad alta/media/baja y pueden filtrarse y exportarse a CSV. «Revisar ficha» lleva al editor ya existente. La exportación se genera localmente en el navegador; **no añade permisos de lectura pública**.

### Uso en el proyecto

1. Abrir la versión publicada en https://iscrod.github.io/cimat-conocimiento-web/ e iniciar sesión como administrador global.
2. Ir a **Modelo y diagramas**, elegir el dominio **NTP-RT-ISO/IEC TR 29110-5-1-2:2012**.
3. Pulsar **Auditar dominio seleccionado** y consultar el resumen e incidencias.
4. Filtrar por alta prioridad y revisar en el PDF las fichas indicadas; no asumir que una alerta equivale a error normativo demostrado.
5. Si se corrige manualmente una ficha, pulsar **Auditar dominio seleccionado** otra vez para recalcular; no se guardan estados de auditoría permanentes.
6. Utilizar **Ir al diagrama** para ver el modelo provisional y **Exportar diagnóstico CSV** para documentar los hallazgos en la tesis.

### Estado y límites

Para el dominio peruano se recibieron de la versión 0.8.1 **149 elementos, 106 relaciones y 254 evidencias**. Ninguna propuesta fue aprobada por esta versión. La auditoría encuentra hipótesis de corrección, no reinterpreta automáticamente citas; algunas relaciones pueden ser legítimas pese a una advertencia.

La **v0.8.2b** deberá implementar revisión experta transaccional, reconciliación de fichas con conservación de las evidencias y control de cambios. La **v0.8.2c** completará la validación jerárquica y la generación de diagramas depurados por estado de revisión.

### Pruebas reproducibles

```bash
node --test tests/auditoria.test.cjs
```

Estas pruebas usan el motor puro `auditoria-core.js` y no requieren acceso a Supabase ni a Gemini.

### Referencias

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Supabase — API REST](https://supabase.com/docs/guides/api).
- Fuente del dominio: PDF peruano NTP-RT-ISO/IEC TR 29110-5-1-2:2012, registrado en la biblioteca privada. Las afirmaciones específicas sobre componentes, roles y tareas deben verificarse en la edición cargada antes de su aprobación.

---


## Resultado de prueba en Supabase (3 de noviembre de 2026)

La auditoría se ejecutó sobre el dominio peruano **NTP-RT-ISO/IEC TR 29110-5-1-2:2012**, con 83 páginas, 149 elementos, 106 relaciones y 254 evidencias. Detectó **121 avisos**: 42 de prioridad alta, 35 media y 44 baja.

Por categoría: 70 avisos de relaciones, 35 de jerarquía, 8 de posibles duplicados y 8 de cobertura. **Cero avisos en la regla básica de existencia de fuente**, lo cual no demuestra que las citas ni las interpretaciones sean correctas.

### Interfaz

En **Modelo y diagramas → Auditoría del conocimiento · v0.8.2a** el administrador puede:

- Ejecutar la auditoría de la edición seleccionada, sin mezclar dominios.
- Consultar un resumen por prioridad y filtrar por categoría.
- Revisar cada aviso y localizar su ficha o relación asociada.
- Exportar los hallazgos como CSV, con protección básica contra fórmulas incrustadas.

La lógica funciona en `auditoria-core.js` y su presentación en `auditoria.js`. Se consultan datos mediante la sesión autenticada y las políticas RLS. **No se ejecuta ninguna operación de escritura** al auditar. Las reglas de numeración GP/IS se activan únicamente para el dominio 29110 y se consideran hipótesis para revisar frente al PDF, no requisitos automáticamente certificados.

### Evidencia de fallos relevantes

- Actividades `GP.2`, `GP.3`, `IS.3`, `IS.5`: ausentes o clasificadas en categorías distintas de las esperadas.
- `IS.2`: al menos dos fichas incompatibles, clasificadas como proceso y actividad.
- Las relaciones de rol y tarea, o proceso y producto, pueden tener dirección incoherente.
- La deduplicación por coincidencia textual no resuelve equivalencias semánticas: se mantienen como propuestas, no fusiones automáticas.

### Estado y siguientes tareas

**v0.8.2a está implementada y evaluada con datos reales.** Falta la prueba visual en el navegador del usuario. La siguiente subetapa, v0.8.2b, deberá incorporar revisión y aceptación explícita de correcciones con registro de auditoría y, después, consolidación segura de duplicados, preservando todas sus evidencias y relaciones.

Documentación oficial: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

---

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
