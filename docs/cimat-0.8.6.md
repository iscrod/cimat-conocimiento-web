# CIMAT 0.8.6 — Banco de preguntas genéricas (MVP)

**Fecha de integración:** 19 de noviembre de 2026.

## Propósito

Implementar un instrumento de elicitación de conocimiento tácito **independiente de normas, sectores, profesiones y métodos de referencia**. Esta versión configura preguntas; no entrevista a personas, no invoca modelos de IA y no interpreta respuestas.

## Funciones incorporadas

1. **Instrumentos versionados:** crear un cuestionario, editar borradores, publicar una versión inmutable y generar una versión nueva conservando el original.
2. **Banco modular:** 12 preguntas iniciales editables distribuidas por dimensiones de contexto, actividad, episodios, secuencia, recursos, colaboración, decisiones, excepciones, experiencia y validación.
3. **Configuración de cada pregunta:** dimensión, prioridad (principal/complementaria), texto, objetivo de extracción, hasta ocho sondeos posibles y estado habilitado/deshabilitado.
4. **Orden de preguntas:** desplazamiento arriba/abajo, sin imponer la secuencia en que luego deba aplicarse una entrevista adaptativa.
5. **Control de cambios:** confirmación antes de abandonar cambios sin guardar y verificación optimista por marca temporal al guardar.
6. **Seguridad:** datos almacenados en PostgreSQL con RLS; solo administradores globales pueden leer, crear, modificar y publicar cuestionarios. Sin permisos para el rol anónimo ni eliminación desde el cliente.
7. **Separación de módulos:** el instrumento no depende de la biblioteca de normas ni modifica tareas, relaciones, productos o diagramas de la versión anterior.

## Estructura técnica

- \`cuestionario.js\`: gestión de interfaz, validación en cliente y peticiones autenticadas a PostgREST.
- \`cuestionario.css\`: diseño responsivo.
- \`index.html\`: pestaña **Cuestionario genérico**.
- \`sql/cimat_086_cuestionarios.sql\`: tabla \`public.cimat_086_cuestionarios\`, políticas RLS, función de protección, disparador y cuestionario inicial.
- \`preguntas\` (JSONB): lista con \`id, orden, dimension, prioridad, pregunta, objetivo, sondeos, habilitada\`.

Cada fila del cuestionario constituye una **versión completa**. La transición de \`borrador\` a \`publicado\` es irreversible. La nueva versión se crea con una fila nueva y referencia \`origen_id\`.

**No guardar respuestas reales de empleados en esta tabla.** Las sesiones y su consentimiento pertenecen a CIMAT 0.8.7.

## Verificación y límites

Pruebas de integración realizadas:
- 12 preguntas iniciales y 12 habilitadas en la base de datos.
- Políticas RLS: lectura, inserción y actualización restringidas al administrador global; sin permisos públicos al rol \`anon\`.
- Disparador: intenta impedir modificaciones a una versión publicada; se verificó mediante prueba SQL temporal que no dejó registros.
- Sintaxis de JavaScript verificada y correspondencia de IDs de interfaz comprobada.
- No se ejecutaron pruebas E2E con una sesión real de administrador en un navegador; se recomienda su validación manual.

Secuencia de aceptación sugerida:
1. Iniciar sesión como administrador global y abrir **Cuestionario genérico**.
2. Editar una pregunta, modificar la prioridad, reordenar y deshabilitar otra; guardar y recargar.
3. Confirmar que persisten las modificaciones.
4. Publicar la versión y comprobar que el editor queda bloqueado.
5. Crear una versión nueva, modificarla y comprobar que la publicada anterior no cambió.
6. Iniciar sesión con una cuenta sin permisos globales y verificar que no puede ver ni modificar el instrumento.
7. Regresar a **Modelo y diagramas** y comprobar que los datos y el grafo permanecen intactos.

## Distinción metodológica

Una pregunta es un **estímulo de elicitación**. La extracción de conocimiento tácito no está garantizada por el solo hecho de contestarla. Las siguientes versiones deberán incorporar relatos de incidentes, seguimiento contextual, comprobación contra episodios concretos y validación por la persona entrevistada.

### Fundamentos bibliográficos

- Flanagan, J. C. (1954). *The critical incident technique*. Psychological Bulletin, 51(4), 327–358. https://doi.org/10.1037/h0061470
- Klein, G. A., Calderwood, R., & MacGregor, D. (1989). *Critical decision method for eliciting knowledge*. IEEE Transactions on Systems, Man, and Cybernetics, 19(3), 462–472. https://doi.org/10.1109/21.31053
- Kallio, H., Pietilä, A.-M., Johnson, M., & Kangasniemi, M. (2016). *Systematic methodological review: Developing a framework for a qualitative semi-structured interview guide*. Journal of Advanced Nursing, 72(12), 2954–2965. https://doi.org/10.1111/jan.13031

**Nota:** La selección y combinación de dimensiones del cuestionario CIMAT constituye una propuesta de diseño aún pendiente de validación empírica.
