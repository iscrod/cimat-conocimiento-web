# CIMAT 0.8.7 — Gestión de entrevistas genéricas

**Fase:** prototipo académico. **Estado:** implementación técnica para pruebas con información ficticia. **Dependencia:** CIMAT 0.8.6 (banco versionado de preguntas).

## 1. Propósito y alcance

Permitir que una persona autorizada inicie una entrevista **independiente de cualquier norma, estándar, organización o sector**, responda por escrito las preguntas de un cuestionario genérico previamente publicado y reanude una sesión más adelante.

En **0.8.7 todavía no hay inteligencia artificial**, selección adaptativa de preguntas, extracción automática de tareas ni construcción de diagramas. El registro de respuestas es un dato primario, no una interpretación formalizada.

## 2. Flujo de trabajo

1. Un administrador global prepara y **publica** un cuestionario en 0.8.6. Solo las versiones publicadas pueden usarse.
2. Una cuenta con rol activo «entrevistado» (o administración global, para pruebas) entra en la pestaña **Entrevistas**.
3. El sistema muestra información sobre finalidad, uso de datos y límites del prototipo. La persona debe marcar expresamente la casilla de aceptación.
4. Se crea una sesión con \`cuestionario_id\`, \`usuario_id\` e información de consentimiento. La relación con la versión publicada es inmutable.
5. La persona responde u omite cada pregunta. Las respuestas se guardan explícitamente en Supabase; **no** se envían a IA.
6. Puede pausar, salir y reanudar. La aplicación abre la primera pregunta no registrada.
7. Para finalizar, todas las preguntas habilitadas deben tener respuesta u omisión registrada. La entrevista finalizada es de solo lectura.
8. El propio titular puede **retirar su consentimiento** borrando la sesión. PostgreSQL elimina en cascada las respuestas asociadas de las tablas activas.

## 3. Archivos

- \`index.html\`: pestaña «Entrevistas», finalidad y consentimiento, listado de sesiones, controles de navegación y retiro.
- \`entrevistas.js\`: acceso autenticado por JWT, consultas a PostgREST, guardado explícito, reanudación, navegación y finalización.
- \`entrevistas.css\`: interfaz responsiva.
- \`sql/cimat_087_entrevistas.sql\`: políticas de acceso, tablas \`cimat_087_entrevistas\` y \`cimat_087_respuestas\`, disparadores y comprobaciones de integridad.
- \`sql/cimat_087_actividad.sql\`: actualización de la fecha de actividad de la sesión al registrar una respuesta.

## 4. Datos y trazabilidad

**Sesión:** \`id, usuario_id, cuestionario_id, estado, consentimiento_confirmado, consentimiento_version, consentimiento_fecha, creado_en, actualizado_en, finalizado_en\`.

**Respuesta:** \`entrevista_id, pregunta_id, estado, respuesta, creado_en, actualizado_en\`. Los estados son \`respondida\` u \`omitida\`; la omisión no almacena texto.

El par \`(entrevista_id, pregunta_id)\` es único. El contenido de cada respuesta se vincula con el identificador de la pregunta exacta y con una sesión que apunta a una **versión publicada e inmutable** del cuestionario. En esta etapa, la respuesta puede corregirse mientras la entrevista está en curso; se conserva el último texto guardado, sin historial de revisiones. La auditoría de revisiones y la formalización de hallazgos se contemplan para versiones posteriores.

## 5. Seguridad y privacidad

- Se reutiliza **Supabase Auth** y la función de administración global existente.
- Únicamente una cuenta con asignación activa como \`entrevistado\` en una organización activa, o un administrador global, puede iniciar sesiones.
- La lectura, modificación y eliminación de una sesión corresponden al **usuario propietario**. No existe una política RLS que conceda a empresas, expertos o administradores funcionales acceso a entrevistas y respuestas ajenas.
- Los usuarios autorizados pueden leer **solo** los cuestionarios publicados. Los borradores del banco siguen siendo privados de administradores.
- El servidor comprueba consentimiento afirmativo, estado de la sesión, pertenencia de la pregunta y completitud antes de finalizar.
- Un registro finalizado no puede modificarse mediante la API habitual. Se permite al titular eliminarlo para retirar su consentimiento.
- \`anon\` no recibe privilegios en las tablas de entrevistas ni respuestas.
- **Límite de confidencialidad:** los operadores técnicos con privilegios suficientes sobre PostgreSQL/Supabase pueden acceder a los datos subyacentes. RLS protege el acceso por la aplicación; no constituye cifrado de extremo a extremo.
- **Límite de retiro:** se borran sesión y respuestas de las tablas activas. Pueden existir copias de respaldo o registros técnicos temporalmente, conforme a la operación del proveedor.
- **Límite de madurez:** no está aprobado un protocolo de datos personales reales ni se ha establecido plazo formal de conservación. Mantener la restricción de pruebas exclusivamente ficticias hasta realizar evaluación institucional, aviso de privacidad, minimización y autorización aplicable.

## 6. Verificación efectuada

Pruebas de integración SQL con contexto de rol autenticado y transacción revertida (sin conservar datos de prueba):
- El administrador autenticado puede consultar la versión publicada y comenzar una sesión.
- Consentimiento negativo rechazado.
- Guardado de respuestas/omisiones asociado a preguntas habilitadas.
- Finalización incompleta rechazada.
- IDs de preguntas inexistentes rechazados.
- Modificación de respuestas después de finalizar bloqueada.
- Acceso de identidad distinta a sesión y respuestas bloqueado por RLS.
- Eliminación del propietario propaga el borrado de respuestas.
- Sintaxis de \`entrevistas.js\` comprobada y referencias a IDs de la interfaz verificadas.

**Pendiente:** prueba E2E con navegador y sesión humana de rol \`entrevistado\` y sesión administrativa; ensayos de concurrencia, accesibilidad, dispositivos móviles y políticas de retención. No afirmar que estas pruebas ya están completadas.

## 7. Prueba manual de aceptación

1. Abrir https://iscrod.github.io/cimat-conocimiento-web/, iniciar sesión con cuenta autorizada y abrir **Entrevistas**.
2. Seleccionar un cuestionario publicado, marcar consentimiento y pulsar «Comenzar entrevista».
3. Responder una pregunta ficticia, guardar, omitir la siguiente y pausar.
4. Reabrir la sesión: deben conservarse la respuesta y la omisión. Una omisión puede reemplazarse por una respuesta posterior.
5. Intentar finalizar antes de completar todo: no debe permitirse.
6. Registrar las respuestas restantes (o la omisión voluntaria), finalizar y confirmar que ya no pueden alterarse.
7. Eliminar la sesión mediante «Retirar consentimiento y borrar sesión»; comprobar que desaparece de la lista.
8. Acceder con una cuenta no autorizada y verificar que no hay acceso ni a sesiones ajenas ni a respuestas individuales.
9. Abrir los módulos **Cuestionario genérico** y **Modelo y diagramas** y confirmar que siguen funcionando.

## 8. Referencias metodológicas y técnicas

- Flanagan, J. C. (1954). The critical incident technique. *Psychological Bulletin, 51*(4), 327–358. https://doi.org/10.1037/h0061470
- Klein, G. A., Calderwood, R., & MacGregor, D. (1989). Critical decision method for eliciting knowledge. *IEEE Transactions on Systems, Man, and Cybernetics, 19*(3), 462–472. https://doi.org/10.1109/21.31053
- Kallio, H., Pietilä, A.-M., Johnson, M., & Kangasniemi, M. (2016). Systematic methodological review: Developing a framework for a qualitative semi-structured interview guide. *Journal of Advanced Nursing, 72*(12), 2954–2965. https://doi.org/10.1111/jan.13031
- Supabase. *Row Level Security*. https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase. *Securing your API*. https://supabase.com/docs/guides/api/securing-your-api

**Advertencia metodológica:** el diseño de CIMAT 0.8.7 es una propuesta de ingeniería fundamentada en métodos de elicitación, pero no una demostración empírica de que el cuestionario extrae conocimiento tácito con determinada precisión. La evaluación científica se realizará mediante entrevistas piloto y revisión de expertos.

## 9. Ajuste adicional de seguridad y retiro

- `sql/cimat_087_seguridad_ajustes.sql` sustituye la función privilegiada expuesta por una comprobación interna en el esquema `private`, dejando un envoltorio `SECURITY INVOKER` en la API pública. Se mantiene la misma regla de autorización.
- Si se revoca posteriormente el rol de entrevistado, la persona puede seguir leyendo sus sesiones previas, consultar el instrumento publicado que utilizaron y retirar su consentimiento mediante eliminación. No puede iniciar entrevistas nuevas.
- Las pruebas SQL verificaron rechazo de preguntas ajenas, protección de respuestas finalizadas y eliminación en cascada; no se conservaron los registros sintéticos empleados en esas pruebas.
- La revisión de seguridad confirmó RLS activo y ausencia de permisos públicos para `anon` en las tablas de sesiones y respuestas. Permanecen avisos de configuración generales no atribuibles al módulo 0.8.7.
