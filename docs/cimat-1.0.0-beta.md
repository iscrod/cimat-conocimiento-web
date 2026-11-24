# CIMAT 1.0.0-beta — Extracción y formalización de conocimiento tácito

**Estado:** beta técnica para pruebas con datos ficticios (24 de noviembre de 2026).  
**Sitio:** https://iscrod.github.io/cimat-conocimiento-web/  
**Base:** CIMAT 0.8.7, con banco de preguntas genéricas 0.8.6.

## 1. Principio metodológico

La extracción parte de un **relato libre de la actividad real del trabajador**, no de tareas de ISO/IEC 29110 ni de ningún modelo de referencia. Las preguntas neutrales de seguimiento exploran criterios, decisiones, excepciones, episodios específicos y conocimiento adquirido mediante la práctica.

Se distinguen expresamente:

- **Respuesta original:** palabras registradas por el participante; solo se cambian si el participante edita su entrevista en curso.
- **Pregunta de seguimiento:** sugerencia metodológica; se registra únicamente después de que la persona la selecciona.
- **Hipótesis de hallazgo:** propuesta que referencia un fragmento literal de respuesta, aún no confirmada.
- **Hallazgo confirmado/rechazado:** revisión por el titular de la entrevista; no equivale necesariamente a validación por un experto externo.
- **Relación de proceso:** vínculo explícitamente registrado entre elementos confirmados.
- **Comparación normativa:** posterior, opcional y manual; nunca determina automáticamente cumplimiento.
- **Modelo provisional:** grafo de hallazgos confirmados y sus relaciones; susceptible de revisión.

## 2. Funciones desarrolladas

### A. Seguimiento adaptativo basado en reglas

La pestaña **Laboratorio beta** permite seleccionar una entrevista existente y elegir una respuesta guardada. Se proponen preguntas neutrales cuando aparecen expresiones como "depende", "normalmente", "reviso", "aviso", "experiencia" o "problema". También se recuperan posibles sondeos configurados en la versión publicada del cuestionario. El sistema evita sugerir de nuevo preguntas idénticas que ya fueron registradas.

Este motor es **determinista y explícito; no se presenta como IA**. El participante puede añadir preguntas propias y responderlas u omitirlas mientras su entrevista esté en curso.

### B. Seguimiento opcional con IA

La Edge Function \`cimat-entrevista-beta\` acepta la acción \`sondear\` y recibe solo una respuesta seleccionada. Exige **consentimiento adicional en el momento de uso**. Devuelve entre cero y tres propuestas de preguntas abiertas; el usuario decide cuáles registrar. No guarda preguntas automáticamente.

### C. Extracción de conocimiento mediante IA

La misma función acepta la acción \`extraer\`. Lee exclusivamente respuestas de la **entrevista autenticada que pertenece al usuario**, nunca entrevistas ajenas. Transmite sus respuestas solo con consentimiento específico, a través del servidor, al proveedor configurado (Gemini). No expone claves del proveedor en el navegador.

La IA puede proponer: proceso, actividad, tarea, decisión, rol, entrada, salida, excepción o criterio. El servidor **rechaza** cada propuesta cuyo fragmento de evidencia no sea una subcadena exacta de la respuesta identificada. La IA no confirma hallazgos ni inventa automáticamente precedencias.

El participante decide qué hipótesis guardar y confirma o rechaza cada una posteriormente.

**Condición operativa:** la llamada externa requiere \`CIMAT_GEMINI_API_KEY\` válida en los Secrets de Supabase. El servicio está desplegado, pero todavía no existe una prueba autenticada completa del proveedor para esta función beta. Si la clave falta o falla la cuota, la captura manual y el seguimiento por reglas siguen disponibles.

### D. Modelo provisional y visualización

Los hallazgos confirmados se presentan con Cytoscape.js como nodos. Las relaciones solo se dibujan cuando se han registrado explícitamente entre hallazgos confirmados. Por tanto, **la posición del nodo no prueba un orden de tareas**, ni la aplicación inventa dependencias a partir de la proximidad visual.

La edición de un hallazgo durante la revisión es limitada en esta beta: se permite cambiar el estado; para corregir su descripción o identificación debe registrarse una nueva hipótesis fiel a la evidencia y rechazar la anterior. No hay edición histórica auditada.

### E. Comparación opcional y exportación

Se pueden registrar observaciones respecto de una referencia con nombre y versión, después de confirmar los hallazgos. No existe aún correspondencia automática con el catálogo normativo de CIMAT y no se genera un juicio automático de conformidad.

La exportación produce un archivo JSON con **elementos confirmados, evidencia literal, relaciones y comparaciones**. No incluye todas las respuestas completas, pero puede contener datos sensibles si se usaran respuestas reales.

## 3. Persistencia y controles de acceso

Tablas creadas en Supabase:

- \`public.cimat_10_seguimientos\`
- \`public.cimat_10_hallazgos\`
- \`public.cimat_10_relaciones\`
- \`public.cimat_10_contrastes\`
- \`public.cimat_10_ia_ejecuciones\`

Estas tablas usan RLS para aislar las entrevistas y vincular cada registro con su propietario. Las funciones de extracción reciben un JWT y verifican en el servidor que el usuario es el propietario. Los hallazgos se anclan a respuestas originales mediante fragmentos literales.

Las claves de administración y del proveedor de IA permanecen **solo en Supabase Edge Functions**, no en GitHub Pages. Se otorgaron privilegios de lectura mínimos a \`service_role\` y de escritura exclusivamente sobre su registro de ejecución de IA.

El retiro del consentimiento y borrado de una entrevista elimina sus seguimientos, hallazgos, relaciones, comparaciones y registros de ejecución asociados **de las tablas activas**. Esto no garantiza eliminación inmediata en respaldos ni en sistemas externos del proveedor que recibió texto con autorización.

**Importante:** el sistema restringe el acceso desde la aplicación, pero operadores técnicos con privilegios sobre infraestructura o base de datos pueden tener acceso conforme a sus responsabilidades. No es cifrado de extremo a extremo.

## 4. Archivos incorporados

| Archivo | Finalidad |
|---|---|
| \`beta.js\` | Motor de seguimiento, interfaz de revisión, diagrama, comparación y exportación |
| \`beta.css\` | Diseño responsivo del laboratorio |
| \`index.html\` | Pestaña «Laboratorio beta» |
| \`sql/cimat_100_beta.sql\` | Modelo de datos, RLS y validaciones del lado del servidor |
| \`sql/cimat_100_beta_privilegios_servidor.sql\` | Privilegios mínimos para el servicio IA |
| \`supabase/functions/cimat-entrevista-beta/index.ts\` | API de generación de sondeos y propuestas de extracción con consentimiento |

Se conservaron \`entrevistas.js\`, \`cuestionario.js\` y los módulos normativos existentes.

## 5. Pruebas técnicas realizadas

Pruebas SQL ejecutadas con transacciones revertidas, sin conservar registros ficticios:

- Creación de sesión a partir de cuestionario publicado y consentimiento afirmativo.
- Registro y respuesta de preguntas de seguimiento.
- Registro de hipótesis con fragmento literal y cambio de estado a confirmado.
- Rechazo por el servidor de evidencias que no existen en la fuente.
- Creación de relaciones y de observaciones de comparación con hallazgos confirmados.
- Aislamiento de seguimientos y hallazgos entre dos identidades simuladas bajo RLS.
- Borrado en cascada al retirar la sesión.
- Verificación de privilegios mínimos de la cuenta de servicio para IA y denegación de lectura al rol \`anon\`.
- Comprobación de sintaxis del cliente JavaScript y coincidencia entre sus identificadores de DOM y el HTML.
- Edge Function desplegada y reportada como activa.

**Pruebas no efectuadas:** navegación E2E con usuarios reales y móviles, invocación autenticada con respuestas al proveedor Gemini, cuota y latencia, seguridad de proveedores externos, prueba de concurrencia, validación por expertos independientes y evaluación empírica de extracción de conocimiento tácito.

## 6. Prueba manual recomendada

1. En «Entrevistas», crear una sesión ficticia con un cuestionario publicado y responder dos preguntas como si se trabajara en un almacén o una oficina.
2. Abrir «Laboratorio beta» y seleccionar la sesión.
3. En el apartado 1, elegir una respuesta que incluya "normalmente" o "depende"; registrar y contestar una pregunta de seguimiento.
4. En el apartado 2, registrar un hallazgo manual con una **cita textual exacta** tomada de una respuesta. Confirmar que no se permite una cita inventada.
5. Confirmar al menos dos hallazgos e identificar explícitamente una relación entre ellos.
6. Comprobar que el grafo muestra los elementos y la relación.
7. Registrar una comparación opcional con una referencia bien identificada; verificar que no modifica la entrevista.
8. Exportar el modelo y revisar el archivo JSON en un editor de texto.
9. Solo con respuestas ficticias y consentimiento adicional, probar sondeos y extracción con IA. Si la función indica ausencia de clave, verificar configuración y cuota en Supabase.
10. Abrir una segunda cuenta y verificar que no aparecen entrevistas ni modelos de la primera.
11. Retirar el consentimiento desde «Entrevistas» y comprobar que también desaparecen sus seguimientos, hallazgos y relaciones del laboratorio.

## 7. Limitaciones de esta beta y criterios hacia 1.0.0 estable

Esta versión es un **prototipo funcional para evaluación**, no una prueba de eficacia científica. Antes de 1.0.0 estable se requiere al menos:

1. Revisión institucional del tratamiento de datos reales y consentimiento específico para el proveedor externo; aprobación ética cuando proceda.
2. Pruebas E2E con diferentes cuentas, sesiones simultáneas, redes, navegadores y dispositivos.
3. Validación independiente por expertos con acceso explícitamente autorizado, sin divulgar entrevistas automáticamente a empresas.
4. Historial inmutable de correcciones y decisiones de validación.
5. Correspondencia trazable y verificable con modelos normativos, sin convertir una discrepancia en incumplimiento por defecto.
6. Piloto con ocupaciones diferentes y métricas predefinidas: cobertura del proceso, fidelidad de la reconstrucción, precisión de evidencias, utilidad, carga de entrevista, tiempo, acuerdo interevaluador y omisiones.
7. Evaluación de sesgos, errores de IA, costos, latencia y límites de uso; política de retención y borrado aplicable.
8. Mejorar extracción de decisiones y secuencias a partir de múltiples relatos, sin inventar relaciones no corroboradas.

## 8. Fundamentos metodológicos y técnicos

- Polanyi, M. (1966). *The Tacit Dimension*. University of Chicago Press.
- Flanagan, J. C. (1954). *The critical incident technique*. **Psychological Bulletin, 51**(4), 327–358. https://doi.org/10.1037/h0061470
- Klein, G. A., Calderwood, R., & MacGregor, D. (1989). *Critical decision method for eliciting knowledge*. **IEEE Transactions on Systems, Man, and Cybernetics, 19**(3), 462–472. https://doi.org/10.1109/21.31053
- Kallio, H., Pietilä, A.-M., Johnson, M., & Kangasniemi, M. (2016). *Systematic methodological review: Developing a framework for a qualitative semi-structured interview guide*. **Journal of Advanced Nursing, 72**(12), 2954–2965. https://doi.org/10.1111/jan.13031
- Supabase. *Row Level Security*. https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase. *Edge Functions*. https://supabase.com/docs/guides/functions
- NIST. *AI Risk Management Framework 1.0*. https://doi.org/10.6028/NIST.AI.100-1

**Aclaración científica:** los fundamentos anteriores orientan el diseño; no validan empíricamente, por sí solos, el cuestionario ni el algoritmo específico CIMAT.
