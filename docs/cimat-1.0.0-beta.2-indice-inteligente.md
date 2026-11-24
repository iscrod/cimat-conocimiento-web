# CIMAT 1.0.0-beta.2 — Índice Inteligente de Conocimiento

**Fecha de integración:** 24 de noviembre de 2026.  
**Estado:** beta técnica integrada. **No equivale a validación científica final.**

## Propósito

Ampliar CIMAT sin modificar las tablas aprobadas de Biblioteca, constructor de modelos, cuestionario y entrevistas. La entrevista mediante chat identifica el proceso real de un trabajador; un servicio separado busca correspondencias posibles entre elementos de modelos y metodologías registrados. La coincidencia es una **hipótesis documentada**, no una afirmación de cumplimiento.

## Arquitectura y cinco etapas

### 1. Catálogo unificado y trazable

- Tabla derivada operativa: \`cimat_12_catalogo\`, con identificador original, tipo, nombre, descripción, documento/página, dominio, edición, procedencia y huella del contenido.
- Tabla \`cimat_12_enlaces\`: relaciones provenientes de \`cimat_0852_tareas_productos\`, \`cimat_0852_tareas_roles\`, precedencias, características y relaciones entre procesos, actividades y tareas.
- Reconstrucción autorizada \`cimat_12_reindexar_servicio\`: actualiza filas derivadas y desactiva elementos ausentes, sin sobrescribir los datos originales. Si cambia un texto, invalida su embedding anterior.
- Estado observado: 57 elementos indexados, 137 relaciones, dos dominios ISO/IEC 29110 registrados (solo uno con contenido estructurado).
- La Biblioteca sigue siendo el origen normativo, no el índice. Cada elemento conserva el identificador de su modelo y la procedencia disponible.

### 2. Prácticas y criterios documentados

- Tablas aditivas: \`cimat_12_practicas\`, \`cimat_12_criterios\`, \`cimat_12_alias\`.
- Campos opcionales para fuente, edición, documento, página y apartado; separación entre afirmación explícita de la fuente e interpretación técnica.
- Revisión humana de criterios; no atribuir requisitos normativos a interpretaciones sin fuente.
- Módulo administrativo **Índice Inteligente** para registrar prácticas, criterios y comprobar cobertura.
- El sistema admite modelos que no distinguen formalmente entrada, salida o tarea: los campos ausentes permanecen ausentes; CIMAT no debe fabricarlos.

### 3. Recuperación textual, vectorial y actualización

- Funciones \`cimat_12_buscar_servicio\` (servicio protegido), \`cimat_12_vector_servicio\` y sincronización del índice.
- Índices de texto completo PostgreSQL, similitud trigram y campo vectorial pgvector de 768 dimensiones.
- Edge Function \`cimat-indice-inteligente\` con autorización del administrador para consultar, reconstruir y, **solo con consentimiento separado**, generar embeddings de referencias compartidas.
- Si aún no se han generado embeddings o no hay clave segura del proveedor, la búsqueda textual continúa funcionando. **A 24/11/2026 hay 0 de 57 embeddings generados**; por lo tanto, la búsqueda semántica vectorial queda preparada, pero su rendimiento todavía no está verificado.
- Se redujo el procesamiento al omitir cálculos vectoriales durante el chat cuando no hay vectores disponibles.
- Umbral textual conservador 0.075, ajustado en una prueba sintética de ocho casos. Es provisional y debe someterse a prueba con un corpus independiente; no debe presentarse como umbral estadísticamente validado.

### 4. Integración con entrevistador conversacional

- Edge Function \`cimat-entrevista-chat\` consulta el índice por una RPC autorizada; ya no necesita descargar toda la Biblioteca para comparar un relato.
- El entrevistador conserva **preguntas genéricas, neutrales y abiertas**. No debe preguntar si se cumplen requisitos de una norma ni atribuir prácticas no relatadas.
- La detección de tareas, productos, criterios, riesgos o decisiones activa una consulta de candidatos; la IA puede proponer aclaraciones sobre aspectos faltantes sin revelar ni imponer requisitos normativos.
- Coincidencias vinculadas a IDs exactos y edición de los modelos; la interfaz muestra su justificación, los aspectos insuficientemente comprobados y el texto literal del trabajador.
- \`cimat_12_evaluaciones\` y \`cimat_12_criterios_evaluados\` conservan revisión y evidencia. La comprobación de cita textual se hace en el servidor, también para cada criterio evaluado.
- El catálogo y las comparaciones son independientes del modelo real de la organización; no alteran la Biblioteca ni el constructor aprobado.

### 5. Protocolo y herramientas de evaluación científica

Infraestructura operativa: \`cimat_12_casos_piloto\`, \`cimat_12_resultados_piloto\`, \`cimat_12_recuperaciones_piloto\`, \`cimat_12_juicios_expertos\`; panel administrativo para ejecutar pruebas y registrar juicios humanos. Las puntuaciones no sustituyen el juicio experto ni la evaluación del proceso reconstruido.

**Prueba técnica sintética documentada:** 8 casos de distintas ocupaciones (6 con una referencia conocida; 2 controles negativos de jardinería y panadería). Recuperación puramente textual tras calibración del umbral:

| Medida | Resultado |
|---|---:|
| Casos con referencia conocida entre los 5 primeros | 6/6 |
| Casos con referencia conocida en primer lugar | 4/6 |
| Controles negativos que devolvieron candidatos | 0/2 |
| Mean Reciprocal Rank entre casos positivos | 0.7778 |
| Embeddings activos | 0/57 |
| Ranking registrado en la base de datos | Sí, 15 recuperaciones en ejecución SQL |

**Interpretación:** resultados preliminares de ingeniería. Se reutilizaron los mismos casos para ajustar el umbral, por lo que estos valores están sesgados por calibración; no son estimaciones de generalización. Los controles negativos no abarcan la diversidad del trabajo no relacionado con software. No se pueden estimar precisión/recall globales ni un intervalo de confianza con estas anotaciones incompletas.

#### Evaluación empírica que deberá realizarse

1. Definir muestras de trabajadores de ocupaciones diferentes y obtener autorizaciones institucionales y consentimiento de acuerdo con el protocolo aprobado.
2. Construir un corpus de entrevistas independientes del catálogo normativo; conservar versiones y separar datos identificables.
3. Contar con **dos evaluadores independientes** y ciegos a la clasificación automática para etiquetar la relevancia de cada correspondencia y suficiencia de evidencias.
4. Crear conjuntos separados de ajuste y prueba. No reutilizar los mismos casos para seleccionar umbrales y después estimar su rendimiento.
5. Con anotaciones exhaustivas, calcular precisión@5, recall@5, tasa de falsos positivos, MRR, cobertura, tiempos de recuperación, concordancia interevaluador (kappa de Cohen cuando proceda) y la proporción de afirmaciones respaldadas por citas verificables.
6. Contrastar el proceso reconstruido con el trabajador y, cuando sea posible, observación contextual u otra evidencia. Registrar correcciones, discrepancias y conocimiento que no pudo verbalizarse.
7. Comparar al menos un cuestionario fijo, entrevista adaptativa por reglas y entrevista adaptativa con IA, controlando variaciones de participante y aprendizaje entre condiciones.
8. Elaborar un informe de limitaciones y amenazas a la validez (muestra, sesgos de selección, subjetividad, cobertura normativa y dependencia del modelo de IA).

### Pruebas técnicas de aceptación

- [x] No hay modificaciones a tablas \`cimat_0852_*\`.
- [x] El índice conserva vínculos a registros existentes de ISO/IEC 29110.
- [x] El chat invoca recuperación selectiva del nuevo índice con identidad comprobada.
- [x] La función Edge de búsqueda está desplegada y el catálogo tiene contenidos.
- [x] La evidencia de hallazgos y criterios debe aparecer literalmente en el relato.
- [x] RLS está activo en las tablas nuevas; \`anon\` no tiene lectura.
- [x] Prueba sintética textual ejecutada y resultados almacenados.
- [ ] Prueba de interacción completa en navegador con una sesión real.
- [ ] Embeddings creados con autorización y precisión vectorial evaluada.
- [ ] Entrevistas con trabajadores reales y evaluación de expertos independiente.
- [ ] Análisis estadístico de validez y replicabilidad.

### Fuentes institucionales y metodológicas

- PostgreSQL. *Full Text Search*. https://www.postgresql.org/docs/current/textsearch.html
- Supabase. *pgvector: Embeddings and vector similarity*. https://supabase.com/docs/guides/database/extensions/pgvector
- Supabase. *Row Level Security*. https://supabase.com/docs/guides/database/postgres/row-level-security
- Flanagan, J. C. (1954). *The critical incident technique*. Psychological Bulletin, 51(4), 327–358. https://doi.org/10.1037/h0061470
- Klein, G., Calderwood, R., & MacGregor, D. (1989). *Critical decision method for eliciting knowledge*. IEEE Transactions on Systems, Man, and Cybernetics, 19(3), 462–472. https://doi.org/10.1109/21.31053
- Kallio, H., Pietilä, A.-M., Johnson, M., & Kangasniemi, M. (2016). *Systematic methodological review: Developing a framework for a qualitative semi-structured interview guide*. Journal of Advanced Nursing, 72(12), 2954–2965. https://doi.org/10.1111/jan.13031
- NIST (2024). *AI Risk Management Framework: Generative AI Profile*. https://doi.org/10.6028/NIST.AI.600-1

**Regla de investigación:** una correspondencia semántica no es cumplimiento. La validación de una tarea, producto o criterio exige evidencia suficiente contra la fuente exacta, delimitación de aplicabilidad y revisión humana.
