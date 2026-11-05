# Etapa 1 del visor de relaciones — prueba de GP.1 (noviembre de 2026)

Se incorpora una vista experimental con Cytoscape.js (versión 3.34.4) bajo **Modelo y diagramas**, en un acordeón independiente del diagrama original. Genera automáticamente nodos y relaciones con los datos ya cargados del dominio desde las tablas `cimat_0852_*` de Supabase; no realiza escrituras ni añade tablas. Permite filtrar productos, roles, actividades y sugerencias no confirmadas; seleccionar elementos para consultar datos; ajustar zoom y desplazamiento. El orden vertical de tareas sigue la captura, **no** constituye una precedencia; las relaciones almacenadas se muestran como precedencias registradas, sin afirmar que ya estén validadas normativamente. Las hipótesis por productos coincidentes usan trazos discontinuos.

**Pendiente para pruebas del producto final, por decisión del usuario:** etapa 2, historial de cambios; etapa 3, versiones completas del modelo; etapa 4, comparación y recuperación controlada de versiones. Ninguna de estas tres etapas se implementó ahora. La biblioteca está incorporada localmente en `vendor/cytoscape.min.js`, con su licencia MIT en `vendor/CYTOSCAPE-LICENSE`; no requiere consultar un CDN de terceros.

# CIMAT v0.8.5 — Mejoras de captura y presentación (3 de noviembre de 2026)

Se implementaron ajustes de usabilidad al constructor manual, conservando todas las fichas existentes y las fuentes almacenadas en la Biblioteca:

- **Apartados plegables:** los cinco apartados y el diagrama usan controles nativos de expandir/contraer. Solo el apartado 1 está abierto inicialmente.
- **Códigos de actividades por dominio:** en el apartado 1 el administrador selecciona si las actividades usan códigos oficiales. La decisión se guarda en `cimat_0855_configuracion`, protegida mediante RLS y vinculada al dominio. Si no tienen código oficial, no se muestra el campo manual y CIMAT propone un identificador interno como `ACT-0001`. Las actividades previamente registradas conservan sus códigos. El código interno **no se atribuye a la norma**.
- **Orden por registro:** procesos, actividades, tareas y características se visualizan según `creado_en`; ya no se solicita un número de «orden visual». Las relaciones de precedencia siguen siendo **explícitas y separadas** del orden de captura.
- **Confirmación visible:** el formulario de productos y el de tareas tienen mensajes locales de éxito o error, además del mensaje general, que se presentan una vez finalizada la operación de guardado y recarga.
- **Selección por casillas:** en una tarea los roles, las entradas, las salidas y los productos actualizados se eligen con casillas independientes; se permiten selecciones múltiples y ninguno cuando la fuente no lo indique.
- **Sin procesamiento de documentos:** la Biblioteca sigue conservando las fuentes; las tablas se capturan manualmente en Modelo y diagramas.

**Validación:** comprobados los enlaces de recursos, la sintaxis del JavaScript, los IDs de los controles y la tabla de configuración con políticas RLS. La prueba completa de captura y guardado con la sesión administrativa del usuario continúa pendiente.

---

# CIMAT v0.8.5 — Constructor manual de metodologías

**Estado:** Implementado en GitHub y Supabase. Verificadas estructura, sintaxis JavaScript, integridad de llaves foráneas, protección RLS y rechazo de escritura sin sesión administrativa. Pendiente de prueba funcional de captura con la sesión del administrador y revisión visual en navegador.

**Corrección funcional:** la selección de roles de una tarea usa el identificador UUID del catálogo compartido (`rol_id`), no la clave de la asociación por dominio. Evita guardar vínculos con IDs inexistentes.

## Arquitectura de cinco apartados

1. **Selección de dominio y fuentes:** conservar normas, metodologías, ediciones y documentos en Biblioteca. Al registrar una ficha puede asociarse una fuente y página física; no existe procesamiento automático de archivos en esta versión.
2. **Roles:** rol, abreviación y función global. Existe un catálogo compartido; la asociación por dominio permite una función específica sin duplicar el registro global.
3. **Procesos y actividades:** nombre obligatorio, código y descripción opcionales, orden visual y asociación de cada actividad a su proceso. Algunas metodologías no tienen nivel de actividad.
4. **Tareas y relaciones:** tarea asociada a proceso y actividad opcional, rol(es), producto(s) de entrada, salida o actualizados, orden visual y precedencias explícitas. Los productos se registran una vez por dominio y se reutilizan. El orden visual nunca implica una dependencia obligatoria.
5. **Características de productos:** opcionales, múltiples por producto, con texto, orden y referencia documental propia.

### Sugerencias por productos compartidos

La pantalla de **Tabla relacional** detecta coincidencias entre un producto de salida/actualización de una tarea y un producto de entrada de otra tarea. Presenta hasta 25 sugerencias de revisión por dominio. Al pulsar **Revisar posible dependencia** únicamente prepara el formulario de precedencia: **no guarda ni presupone una relación obligatoria**. El administrador debe cotejar la fuente y presionar **Registrar precedencia** si está justificada. Las precedencias declaradas se almacenan separadas del orden visual.

La vista **Diagrama generado** utiliza exclusivamente registros de captura manual. Representa jerarquía, roles, productos, precedencias declaradas y casos en los que un producto aparece como salida de una tarea y entrada de otra. Ese último vínculo **no equivale a una precedencia obligatoria**.

## Compatibilidad y conservación de datos

No se borraron ni sobrescribieron elementos anteriores: los análisis de 2011/2012, sus páginas, las 149 propuestas, 106 relaciones, 254 evidencias y demás metadatos se mantienen en las tablas históricas \`conocimiento_*\`, \`documento_*\` y \`ia_extracciones\`. Los antiguos archivos JavaScript y SQL continúan en GitHub para su posible archivado posterior. Solo se reemplazó la interfaz de Modelo y diagramas por el constructor manual y se quitó de Biblioteca el formulario de procesamiento.

## Modelo nuevo en Supabase

Las migraciones aplicadas son \`cimat_0852_constructor_manual\` y \`cimat_0852_precedencias_actividades\`. El modelo está aislado bajo el prefijo \`cimat_0852_\`:

| Tabla | Función |
|---|---|
| \`roles\` | Catálogo global reutilizable |
| \`roles_dominios\` | Vinculación y función particular |
| \`procesos\` | Procesos y orden visual |
| \`actividades\` | Actividades subordinadas a procesos |
| \`tareas\` | Tareas del proceso, con actividad opcional |
| \`productos\` | Productos únicos por dominio |
| \`tareas_roles\` | N:M entre tarea y rol vinculado al dominio |
| \`tareas_productos\` | N:M entre tarea y producto; flujo entrada/salida/actualiza |
| \`precedencias\` | Dependencia explícita entre tareas |
| \`precedencias_actividades\` | Dependencia explícita entre actividades |
| \`caracteristicas\` | Componentes opcionales de productos |

La función PostgreSQL \`public.cimat_0852_guardar_tarea\` guarda la tarea y sus tres clases de relaciones **en una sola transacción**. Las restricciones impiden referencias entre dominios y las funciones disparadas al insertar precedencias rechazan ciclos. Todas las tablas nuevas tienen **RLS** y políticas de lectura/escritura exclusivas para administradores globales autenticados. No se añadió ninguna clave privada al cliente.

## Guía de uso

1. Abrir [CIMAT](https://iscrod.github.io/cimat-conocimiento-web/), actualizar con Ctrl+F5 e iniciar sesión como administrador.
2. Ir a **Biblioteca**, registrar el dominio y adjuntar el PDF, DOCX o TXT únicamente como fuente documental.
3. Ir a **Modelo y diagramas**; seleccionar el dominio y, cuando corresponda, el documento y la página de referencia.
4. En **Roles**, reutilizar los roles compartidos o crear nuevos.
5. En **Procesos y actividades**, capturar procesos y sus actividades.
6. En **Tabla relacional**, registrar los productos; crear cada tarea y seleccionar sus roles/entradas/salidas. Declarar precedencias solo si están respaldadas por la fuente.
7. En **Características**, agregar opcionalmente los componentes de los productos; consultar el diagrama generado al final.

**Limitaciones:** en esta versión la edición se realiza por ficha; no hay importación automática de tablas ni lectura inteligente de PDF. Los registros se consideran capturas de trabajo y el diagrama no certifica conformidad. Las pruebas de integridad de FK y ciclos se efectuaron dentro de una transacción revertida; quedan pendientes los recorridos completos desde el navegador autenticado.

## Referencias técnicas

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL — Foreign Keys and Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

---

# CIMAT v0.8.2b — Revisión y consolidación controlada

## Funciones disponibles

Desde **Modelo y diagramas → Revisión y consolidación · v0.8.2b**:

- Seleccionar elementos o relaciones, leer la ficha, sus páginas y citas.
- **Corregir categoría** de un elemento propuesto, sujeto a restricciones del esquema.
- **Aprobar, descartar o devolver a propuesto**, con confirmación y justificación humana. La aprobación no representa certificación ISO.
- **Consolidar fichas equivalentes sin destruir datos**: `conocimiento_fusiones` guarda el enlace entre ficha fuente y canónica. El diagrama muestra la representación canónica sin borrar la ficha, las evidencias ni los vínculos originales. Puede deshacerse.
- Consultar la bitácora `conocimiento_revisiones` con autor, fecha, justificación y estados antes/después.
- Desde una incidencia de **Auditoría v0.8.2a** abrir la ficha correspondiente en la revisión.

## Precauciones

- Las consolidaciones son **visuales y reversibles**; no reescriben las evidencias ni los vínculos originales. Por tanto, los informes deben mostrar explícitamente cuándo una relación procede de una ficha consolidada y evitar interpretarla como evidencia nueva.
- El servidor aplica restricciones de dominio, tipo, estado y duplicación, con autorización de administrador global. RLS limita la consulta y escritura de tablas relacionadas.
- La decisión se registra solo al confirmar el usuario. La IA nunca aprueba ni consolida automáticamente.
- Antes de aprobar, el experto debe cotejar citas y significado contra el documento. Una cita presente no demuestra la corrección de una relación.
- La auditoría anterior debe **volver a ejecutarse** después de cada conjunto de correcciones para evaluar el nuevo estado.
- Se conservan los resultados originales del análisis de la norma peruana: **149 elementos, 106 relaciones, 254 evidencias**, sin decisiones aplicadas al inicio de esta etapa.
- La ejecución del frontend ha sido comprobada por sintaxis y las políticas por consultas, pero **no se ha realizado una prueba de extremo a extremo mediante la sesión del administrador**.

## Referencias técnicas oficiales

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase PostgreSQL Functions](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

---

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
