# CIMAT 1.0.0-beta — Entrevista conversacional con IA y comparación de múltiples modelos

**Fecha:** 24 de noviembre de 2026  
**Estado:** prototipo beta, uso exclusivo con relatos y situaciones ficticias hasta superar evaluación institucional de privacidad.  
**Interfaz:** pestaña **Entrevista con IA** en https://iscrod.github.io/cimat-conocimiento-web/

## Cambio metodológico

Antes, el laboratorio ofrecía preguntas de seguimiento aisladas y una extracción de hipótesis ejecutada por separado. En esta iteración se incorpora una **conversación continua**: cada mensaje del trabajador recibe una respuesta contextual que profundiza en su forma real de trabajar, sin partir de tareas predefinidas de una norma.

El orden lógico es:

1. **Elicitación no normativa:** el trabajador relata una actividad específica, sus pasos, decisiones, recursos, productos, excepciones y conocimientos adquiridos en la práctica.
2. **Repregunta adaptativa:** la IA utiliza hasta doce pares recientes de mensajes y las respuestas iniciales pertinentes del cuestionario, y propone una pregunta de seguimiento en lenguaje natural.
3. **Extracción y trazabilidad:** la respuesta de la IA incluye, cuando corresponde, candidatos de proceso, actividad, tarea, decisión, rol, entrada, salida, excepción o criterio. Solo se aceptan candidatos con citas literales verificadas contra el último mensaje del trabajador.
4. **Contraste multi-modelo posterior:** se revisan **todos los dominios registrados que sean públicos y no pertenezcan a una empresa**, y los elementos de tarea y producto que efectivamente estén cargados en la Biblioteca. La IA solo puede mencionar elementos incluidos en el catálogo real recuperado del servidor.
5. **Revisión humana:** la persona puede pedir aclaraciones, clasificar el grado de evidencia disponible y registrar una hipótesis para revisión en el Laboratorio beta. Un hallazgo confirmado no implica conformidad normativa certificada.

**Restricción fundamental:** no introducir un estándar como guía de entrevista salvo que el entrevistado lo solicite. La detección de correspondencias no debe sustituir el descubrimiento del proceso real.

## Funcionalidades entregadas

- Chat con historial persistente por entrevista y usuario.
- Reanudación tras cerrar el navegador y búsqueda de sesiones propias.
- Consentimiento específico por turno antes de enviar datos al proveedor de IA.
- Respuestas contextuales generadas mediante el modelo Gemini actualmente utilizado en Supabase; **no se sustituyó por la API de ChatGPT/OpenAI**, porque un modelo conversacional puede operar con el proveedor existente. El cambio de proveedor permanece técnicamente posible y requiere configuración separada.
- Extracción opcional de hallazgos con evidencia textual exacta del mensaje.
- Guardado de hipótesis en la tabla ya existente \`cimat_10_hallazgos\` mediante \`dialogo_id\`, sin alterar la Biblioteca de modelos.
- Candidatos a correspondencia con **tareas** y **productos de trabajo**, mostrando modelo, edición, descripción y características registradas (cuando existan).
- Clasificación exploratoria de IA: posible, parcial, insuficiente o contradicción; no equivale a «cumple/no cumple».
- Revisión humana separada: evidencia aparentemente compatible, parcial, insuficiente o no corresponde, con observaciones.
- Botón de profundización que **prepara** un mensaje para el chat sin enviarlo automáticamente.
- Límite de 120 turnos por entrevista, un turno en procesamiento por sesión, recuperación de bloqueos tras 3 minutos y límite de contexto para el proveedor.

## Archivos y estructura técnica

| Componente | Descripción |
|---|---|
| \`index.html\` | Nueva pestaña **Entrevista con IA**, consentimiento y explicación de diferencias entre indicio y conformidad |
| \`chat.js\` | Historial, interfaz conversacional, revisión y registro de hipótesis |
| \`chat.css\` | Diseño responsivo de mensajes y fichas de hallazgos |
| \`supabase/functions/cimat-entrevista-chat/index.ts\` | Endpoint autenticado que verifica propiedad, consulta Biblioteca, envía contexto a Gemini y valida resultados antes de persistir |
| \`sql/cimat_110_chat_conversacional.sql\` | Tabla privada \`cimat_11_dialogos\`, RLS y fuente de evidencia conversacional para hallazgos |
| \`sql/cimat_111_revisiones.sql\` | Tabla privada \`cimat_11_revisiones\` y verificación de que las coincidencias realmente existen en un turno propio |

La API de conversación se ubica en \`/functions/v1/cimat-entrevista-chat\`. El proveedor de IA exige la variable privada \`CIMAT_GEMINI_API_KEY\` configurada en el proyecto; **no** debe copiarse ninguna clave en GitHub, JavaScript, el HTML ni mensajes del chat. La función implementa verificación de token con \`auth.getUser\` y de propiedad de entrevista antes de obtener el contexto y procesar una solicitud.

## Alcance real de la comparación con modelos

Al revisar el repositorio de conocimiento el 24/11/2026 se encontraron **dos registros de dominios ISO/IEC 29110**; solo había **15 tareas, 17 productos y 17 características** cargados, principalmente asociados a una edición. Por tanto, la función busca entre **todos los modelos cargados**, pero no puede garantizar cobertura de todas las normas o metodologías existentes.

El catálogo empleado para comparar es la información estructurada que ha sido registrada por los administradores. La simple coincidencia con un nombre o una descripción abre una **hipótesis**, no demuestra que se cumplen la totalidad de criterios de un estándar.

Para demostrar correspondencia formal con una tarea o producto habría que:

1. Verificar la edición y la fuente oficial del modelo.
2. Examinar todos los requisitos y características que correspondan al elemento concreto.
3. Identificar evidencia suficiente del proceso ejecutado y, cuando corresponda, inspeccionar el producto documental real.
4. Registrar faltantes, excepciones, contradicciones y revisión de un experto.
5. Distinguir «similar», «parcialmente compatible», «suficientemente evidenciado» e «incumplimiento» conforme a un protocolo de evaluación previamente definido.

Este prototipo **no implementa un dictamen automático de conformidad**.

## Pruebas efectuadas

Las pruebas SQL transaccionales con \`ROLLBACK\` verificaron:

- Creación de entrevista, mensaje de conversación, hallazgo originado en una cita literal y revisión de correspondencia.
- Lectura de los registros desde la cuenta propietaria.
- Ausencia de lectura del historial desde una identidad autenticada distinta.
- Rechazo del intento de falsificar una respuesta de IA insertando directamente en la tabla del chat con permisos de usuario.
- Eliminación de los datos derivados al retirar una entrevista.
- Sintaxis de \`chat.js\` y correspondencia de todos sus identificadores con la interfaz.
- Ausencia de identificadores HTML duplicados.
- Despliegue de la Edge Function \`cimat-entrevista-chat\` versión 2 en Supabase.

**No se realizó una conversación extremo a extremo con proveedor de IA y cuenta humana.** Antes de declarar que funciona en vivo, confirmar que el secreto Gemini esté presente, que el modelo pueda responder, y que una sesión de navegador real permita enviar, reanudar y revisar mensajes.

## Prueba manual de aceptación (datos ficticios)

1. Iniciar sesión en CIMAT y crear una entrevista en la pestaña **Entrevistas**.
2. Abrir **Entrevista con IA**, seleccionar esa entrevista y escribir un relato ficticio del trabajo, por ejemplo: «Preparo un cronograma con fechas y responsables; luego reviso con el equipo si las tareas son viables».
3. Aceptar expresamente el envío externo, pulsar **Enviar** y verificar que la IA solicite detalles concretos, no que imponga una norma como cuestionario.
4. Responder varias veces, incluyendo decisiones, criterios de revisión y casos excepcionales.
5. Expandir los hallazgos y las coincidencias normativas que pudieran detectarse.
6. Utilizar **Pedir aclaraciones** y revisar que la IA pregunte por evidencia faltante, sin proclamar cumplimiento.
7. Registrar una hipótesis, abrir **Laboratorio beta**, revisar su cita y validarla cuando proceda; comprobar que puede incorporarse al diagrama.
8. Marcar una correspondencia como parcial o insuficiente, con comentario, y verificar su persistencia después de recargar.
9. Cerrar sesión, volver a iniciar y revisar el historial.
10. Retirar el consentimiento de la entrevista y verificar que se elimine el chat y sus hallazgos de las tablas activas.

## Fundamentos metodológicos

- Flanagan, J. C. (1954). *The critical incident technique*. Psychological Bulletin, 51(4), 327–358. https://doi.org/10.1037/h0061470
- Klein, G. A., Calderwood, R., & MacGregor, D. (1989). *Critical decision method for eliciting knowledge*. IEEE Transactions on Systems, Man, and Cybernetics, 19(3), 462–472. https://doi.org/10.1109/21.31053
- Kallio, H., Pietilä, A.-M., Johnson, M., & Kangasniemi, M. (2016). *Systematic methodological review: Developing a framework for a qualitative semi-structured interview guide*. Journal of Advanced Nursing, 72(12), 2954–2965. https://doi.org/10.1111/jan.13031
- NIST. (2024). *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*. https://doi.org/10.6028/NIST.AI.600-1
- Supabase. *Row Level Security*. https://supabase.com/docs/guides/database/postgres/row-level-security

Las preguntas, reglas y criterios de comparación constituyen una propuesta de ingeniería que **aún requiere validación científica mediante entrevistas piloto, análisis de calidad del proceso reconstruido y revisión de expertos**.
