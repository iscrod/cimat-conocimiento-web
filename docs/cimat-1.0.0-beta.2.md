# CIMAT 1.0.0-beta.2 — Índice Inteligente y evaluación reproducible

**Versión:** 1.0.0-beta.2  
**Estado:** integración técnica y piloto sintético; *no* validado empíricamente con trabajadores reales.

## Propósito

Preservar la Biblioteca y el constructor de modelos que fueron aprobados previamente. Incorporar un índice externo a esas estructuras que permita que la entrevista conversacional descubra el proceso real del trabajador y que, en segundo plano, encuentre **posibles** correspondencias con tareas, productos, prácticas y criterios de cualquier modelo que el usuario tenga autorizado consultar.

La búsqueda por semejanza NO equivale a conformidad con un estándar. El entrevistador debe profundizar con preguntas neutrales, sin introducir nombres de normas salvo petición explícita.

## 1. Catálogo unificado

La función administrativa \`cimat_12_reindexar_servicio()\` lee las tablas existentes de:
- \`dominios_conocimiento\`, \`documentos_dominio\`
- \`cimat_0852_procesos\`, \`cimat_0852_actividades\`, \`cimat_0852_tareas\`
- \`cimat_0852_productos\`, \`cimat_0852_roles_dominios\`, \`cimat_0852_caracteristicas\`
- vínculos \`cimat_0852_tareas_productos\`, \`cimat_0852_tareas_roles\` y precedencias.

Genera \`cimat_12_catalogo\` y \`cimat_12_enlaces\`. No modifica los registros de origen. Cada elemento guarda ID, tipo, dominio/edición, descripción, código, documento, página, naturaleza explícita/interpretada y huella de contenido. El índice es derivado y puede reconstruirse; los elementos que dejan de aparecer se marcan inactivos sin borrarse.

**Comprobación real del 24 de noviembre de 2026:** 57 elementos y 137 relaciones derivadas. De los 57 elementos, 15 procedían de tareas, 17 de productos, 17 de características, además de procesos, actividades y roles. No se han creado contenidos normativos sintéticos en la Biblioteca.

## 2. Prácticas, criterios y términos equivalentes

Nuevas tablas \`cimat_12_practicas\`, \`cimat_12_criterios\` y \`cimat_12_alias\`.

- Las prácticas se usan para marcos que no prescriben tareas detalladas.
- Un criterio puede referirse a proceso, actividad, tarea, producto o práctica.
- Los campos fuente incluyen dominio, documento, página y apartado, si el documento fue registrado. La procedencia es **explícita** o **interpretada**.
- El disparador impide asociar un criterio a una tarea o producto inexistente o perteneciente a otro dominio.
- El panel permite crear prácticas y criterios sin editar las tablas aprobadas.
- No se inventan criterios para productos que no los tengan registrados.

**Prueba:** insertar práctica y criterio ficticios con un administrador autenticado; rechazar una referencia inexistente; deshacer toda la transacción.

## 3. Recuperación híbrida y actualización

Supabase PostgreSQL 17, extensiones \`pgvector\` (0.8.2) y \`pg_trgm\` (1.6), con índices FTS, trigramas y HNSW.

- \`cimat_12_buscar_servicio\` devuelve como máximo 30 candidatos, filtrados por dominios globales o empresas a las que pertenezca el usuario autenticado.
- La recuperación textual utiliza \`tsvector\` en español y similitud trigram.
- Cuando existen embeddings de los elementos y de la consulta, el índice combina similitud coseno con señales textuales.
- La función Edge \`cimat-indice-inteligente\` autentica contra Supabase, verifica autorización de administrador para indexar y generar vectores, y mantiene la clave de Gemini en variables seguras del servidor.
- La generación por lotes (hasta seis entradas) solo envía extractos de dominios **compartidos**, nunca documentos de empresas privadas. Requiere aprobación explícita del administrador.
- La ausencia de una clave o de vectores hace que se conserve la búsqueda textual. Se usa \`gemini-embedding-001\` a 768 dimensiones cuando está disponible.
- Reconstruir después de modificar la Biblioteca es actualmente **manual** mediante el botón del Índice Inteligente. No se ha implementado una cola automática para cada edición.
- Las huellas permiten conservar embeddings solo cuando se conserva el contenido utilizado para indexar.

**Estado de vectores del primer índice:** 57 pendientes; la búsqueda textual funciona. Se probó la rama vectorial con un vector artificial de 768 dimensiones dentro de una transacción revertida (similitud 1.0), sin afirmar rendimiento semántico real.

## 4. Chat conversacional y evaluación de evidencias

La Edge Function \`cimat-entrevista-chat\` consulta ahora \`cimat_12_buscar_servicio\` cuando el trabajador menciona señales potenciales de tareas o productos. Deja de descargar en cada turno todos los registros de las tablas originales.

- Solo se envían al modelo los candidatos devueltos por el índice (máximo configurado: 26).
- El entrevistador sigue formulando preguntas abiertas sobre la práctica real; el catálogo es información de apoyo y no instrucciones a obedecer.
- Las propuestas de correspondencia llevan ID del elemento del índice, ID original, modelo/edición, página, estado de origen, cita literal del trabajador y criterios vinculados.
- Desde el chat, la cuenta propietaria de la entrevista puede vincular el candidato a su mensaje original y registrar una evaluación de cada criterio (sin evidencia, respaldado, contradicción o no aplica).
- Las tablas \`cimat_12_evaluaciones\` y \`cimat_12_criterios_evaluados\` están bajo RLS del propio usuario; los disparadores exigen propiedad de entrevista, vínculo normativo válido y citas textuales exactas para evidencias declaradas respaldadas.
- El proceso reconstruido no se mezcla con el catálogo normativo. La IA propone, pero no determina certificación ni cumplimiento.

**Prueba:** crear entrevista y mensaje ficticios, vincular candidato del índice y criterio, guardar un respaldo exacto y rechazar criterio ajeno; todo con transacción revertida.

## 5. Piloto sintético y preparación de validación científica

Tablas:
- \`cimat_12_casos_piloto\`: escenarios y referencias esperadas, incluyendo controles negativos.
- \`cimat_12_resultados_piloto\`: resumen de cada ejecución.
- \`cimat_12_recuperaciones_piloto\`: resultado por caso, candidato, posición y puntaje.
- \`cimat_12_juicios_expertos\`: relevancia asignada por un revisor autenticado, sin etiqueta automática.

**Primer piloto reproducible, búsqueda textual, 24/11/2026:**
- Ocho casos ficticios: seis positivos con una referencia normativa conocida por caso y dos controles negativos (panadería y jardinería).
- Cuatro de los seis casos positivos recuperaron la referencia esperada en la posición 1 (**Hit@1 = 4/6**).
- Los seis la recuperaron dentro de cinco resultados (**Hit@5 = 6/6**).
- Ninguno de los dos controles negativos recibió candidatos tras calibrar el umbral (**0/2 alertas en los controles**).
- **MRR = 0.7778** calculado solo sobre los seis casos positivos.
- Se registraron **15 candidatos recuperados** de la consulta textual para revisión.

Los casos proceden de un único modelo de referencia **con elementos actualmente capturados**: NTP-RT-ISO/IEC TR 29110-5-1-2:2012. No demuestran desempeño con Scrum, CMMI u otros marcos que todavía no tengan tareas o productos registrados.

No se proporciona precisión general, sensibilidad/recall sobre el universo normativo, tasa verdadera de falsos positivos ni concordancia interevaluador: faltan etiquetas de relevancia exhaustivas y al menos dos revisores independientes para cada pareja caso/candidato. Tampoco se atribuye el piloto a participantes reales.

### Diseño para la evaluación formal posterior

1. Construir un corpus de entrevistas con **consentimiento institucional y aviso de privacidad**. Seleccionar perfiles ocupacionales heterogéneos y documentar criterios de muestreo.
2. Establecer un conjunto de procesos de referencia con ayuda de observación contextual y revisión de dos expertos. Separar datos de entrenamiento, afinación y evaluación.
3. Comparar el cuestionario estructurado frente al chat adaptativo: cobertura de actividades, decisiones, excepciones y conocimiento experiencial; preguntas redundantes; carga del participante; grado de fidelidad de los modelos.
4. Etiquetar de forma ciega e independiente la pertinencia de los candidatos normativos y después calcular precisión@k y recall@k contra un conjunto exhaustivo de etiquetas.
5. Calcular acuerdo observado y **kappa de Cohen** para las parejas anotadas por dos revisores; informar tamaño de muestra, incertidumbre y discrepancias resueltas por adjudicación.
6. Reportar latencia de extremo a extremo, costo por entrevista, fallos del proveedor, riesgo de exposición de datos, reproducibilidad de versión y amenazas a validez externa.
7. Considerar la versión de producción solo cuando el estudio haya sido ejecutado con permisos y exista evidencia de funcionamiento E2E en navegador.

La herramienta tiene controles para registrar revisiones humanas y calcular concordancia si existen juicios suficientes, pero **no inventa ni fabrica esos juicios**.

## Operación del panel

1. Acceder como administrador global y abrir **Índice Inteligente**.
2. Revisar elementos y relaciones. Cuando se añada o corrija un modelo, pulsar **Reconstruir índice desde Biblioteca**.
3. Si un marco contiene prácticas o criterios no representados en las tablas originales, registrarlos en el panel junto con fuente y edición.
4. Activar la casilla de autorización solo para los modelos compartidos y pulsar **Generar siguiente lote de vectores** repetidamente si el proveedor está configurado. Los modelos privados no se envían al proveedor.
5. Probar consultas ficticias y ejecutar el piloto textual o semántico autorizado.
6. Etiquetar candidatos con evaluadores independientes; consultar concordancia sin asumirla.
7. Abrir **Entrevista con IA** y registrar correspondencias sustentadas por mensajes del trabajador.

## Pruebas y limitaciones

Realizadas: funciones de indexación sobre datos registrados, búsqueda textual, calibración de controles negativos, ruta pgvector con un vector artificial y rollback, inserción/validación de prácticas y criterios bajo contexto autenticado, vinculación de evidencia y rechazo de criterios ajenos, sintaxis JavaScript, verificación de IDs de interfaz y despliegue de Edge Functions.

Pendientes: recorrido E2E con cuentas reales por navegador, ejecución real de embeddings del proveedor, pruebas de costo/latencia externa, carga/concurrencia, cobertura de diferentes modelos en la Biblioteca, validez científica empírica, privacidad institucional y acuerdo de dos revisores. No utilizar información personal real en esta beta.

## Referencias verificables

- Supabase. *Semantic search*: https://supabase.com/docs/guides/ai/semantic-search
- Supabase. *Hybrid search*: https://supabase.com/docs/guides/ai/hybrid-search
- Supabase. *Row Level Security*: https://supabase.com/docs/guides/database/postgres/row-level-security
- Google AI. *Gemini Embeddings*: https://ai.google.dev/gemini-api/docs/embeddings
- Flanagan, J. C. (1954). *The Critical Incident Technique*. https://doi.org/10.1037/h0061470
- Klein, G. A., Calderwood, R., & MacGregor, D. (1989). *Critical Decision Method for Eliciting Knowledge*. https://doi.org/10.1109/21.31053
- Kallio, H., et al. (2016). *Developing a framework for a qualitative semi-structured interview guide*. https://doi.org/10.1111/jan.13031
- NIST. *AI RMF Generative AI Profile*. https://doi.org/10.6028/NIST.AI.600-1
