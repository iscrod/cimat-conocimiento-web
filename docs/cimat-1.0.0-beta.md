# CIMAT 1.0.0-beta — laboratorio de extracción de conocimiento tácito

**Estado:** beta funcional para pruebas exclusivamente con datos ficticios.  
**Dependencias:** CIMAT 0.8.6 (cuestionarios versionados), CIMAT 0.8.7 (entrevistas, consentimiento, propiedad y respuestas).  
**Objetivo:** descubrir procesos de trabajo reales a partir de entrevistas independientes de cualquier norma, y permitir su revisión humana antes de compararlos con una referencia.

## Módulos

| Módulo | Función | Alcance y estado |
|---|---|---|
| Entrevistas 0.8.7 | Sesiones, consentimiento, respuesta u omisión, reanudación y borrado por retirada | Conservado |
| Seguimiento por reglas | Detecta expresiones como «depende», «normalmente», «reviso», «experiencia» y ofrece preguntas de sondeo; permite preguntas escritas por el entrevistado | Implementado, heurístico, sin IA |
| Seguimiento opcional por IA | Función segura \`cimat-entrevista-beta\`, acción \`sondear\`; requiere consentimiento adicional y configuración de clave del proveedor | Integrado en interfaz; disponibilidad del proveedor depende de las credenciales seguras |
| Extracción | Registro de hipótesis tipo proceso, actividad, tarea, rol, entrada, salida, decisión, criterio, excepción | Implementado, manual y opción IA |
| Trazabilidad | El servidor valida que cada cita textual sea una subcadena exacta de una respuesta fuente de la propia entrevista | Implementado; no equivale a certeza semántica |
| Revisión humana | Cada hipótesis se confirma, rechaza o reabre manualmente | Implementado |
| Modelado del proceso real | Relaciones registradas únicamente entre hallazgos confirmados; visualización con Cytoscape | Implementado como grafo provisional |
| Comparación opcional | Registro de referencia externa y observaciones posteriores al modelo real | Comparación documentada manual, NO evaluación automática de conformidad |
| Exportación | JSON de hallazgos confirmados, relaciones y trazabilidad | Implementada; archivo local contiene citas potencialmente sensibles |

## Arquitectura

La entrevista sigue siendo **independiente de ISO/IEC 29110, ISO 9001 o cualquier otro estándar**. El proceso de extracción produce un **modelo organizacional provisional** que no modifica la Biblioteca, los modelos normativos ni el constructor anterior.

**Archivos nuevos:** \`beta.js\`, \`beta.css\`, \`sql/cimat_100_beta.sql\`, \`supabase/functions/cimat-entrevista-beta/index.ts\`.  
**Archivo modificado:** \`index.html\`, nueva pestaña «Laboratorio beta».

**Tablas nuevas:** \`cimat_10_seguimientos\`, \`cimat_10_hallazgos\`, \`cimat_10_relaciones\`, \`cimat_10_contrastes\`, \`cimat_10_ia_ejecuciones\`.

La relación \`cimat_087_entrevistas → cimat_10_*\` mantiene el aislamiento por sesión. La eliminación de una entrevista elimina también datos relacionados mediante claves foráneas y reglas apropiadas. La base de datos aplica RLS a las tablas de la beta. El acceso funcional de una empresa no permite leer respuestas de empleados.

## Protocolo operativo recomendado

1. Crear una entrevista de prueba con el cuestionario genérico publicado, aceptar su consentimiento y responder con un escenario ficticio.
2. En **Laboratorio beta**, elegir la entrevista y una respuesta original.
3. Elegir una pregunta de seguimiento sugerida por reglas o escribir una nueva, responderla y guardarla.
4. Si hay credenciales configuradas y autorización explícita, solicitar sugerencias adaptativas de IA. **El usuario selecciona qué sugerencias incorporar**.
5. Registrar hipótesis sustentadas por fragmentos exactos de las respuestas, o solicitar candidatos opcionales a la IA.
6. Revisar las hipótesis y confirmar únicamente las que el participante o revisor considere fieles a su relato.
7. Vincular elementos confirmados mediante relaciones justificadas y consultar el grafo provisional.
8. Realizar, si se requiere, un contraste posterior con un documento normativo de edición conocida, sin introducir supuestos normativos en la entrevista original.
9. Exportar el modelo JSON a un entorno bajo control del participante.
10. Repetir el ejercicio con ocupaciones distintas y contrastar los modelos resultantes con observación y revisión experta, antes de concluir validez científica.

## Verificación técnica realizada

Se realizaron consultas de integración en PostgreSQL con contexto simulado de usuario autenticado y transacciones \`ROLLBACK\`, sin retener respuestas ficticias. Se comprobó:

- Creación de entrevista y respuesta original.
- Pregunta de seguimiento y respuesta registrada.
- Creación de dos hipótesis, cada una con una fuente diferente.
- Confirmación manual y creación de relación entre elementos de la misma entrevista.
- Registro de observación de comparación opcional.
- Rechazo de hallazgos con evidencia textual inventada.
- Negación de lectura de seguimiento y hallazgos a una identidad distinta.
- Borrado de datos derivados cuando se retira la sesión.
- Sintaxis de \`beta.js\` comprobada y referencias a elementos de HTML verificadas.

**Pruebas pendientes:** E2E en navegador real con sesión humana; calidad de sugerencias de IA, costos, latencia y disponibilidad del proveedor; usuarios simultáneos; evaluación de modelos con especialistas; accesibilidad; retención y borrado efectivo en respaldos.

## Seguridad y límites de IA

La IA es opcional y requiere aceptación independiente. La función Edge recupera datos de una sesión después de comprobar la identidad contra Supabase Auth y cotejar la propiedad de la entrevista; limita texto enviado y valida la existencia exacta de las citas devueltas. El proveedor configurado en el código es Gemini; el token privado debe proporcionarse como secreto de Supabase (\`CIMAT_GEMINI_API_KEY\`), **nunca en HTML o GitHub**.

La existencia de código y función desplegada **no demuestra** que el proveedor esté configurado y disponible para llamadas reales. Si falta el secreto, la función debe indicar que no está configurada.

Los modelos propuestos por IA no son hechos demostrados: están sujetos a revisión humana y pueden contener omisiones, sesgos o interpretaciones erróneas. La validación de una hipótesis en la interfaz registra una decisión humana; no demuestra por sí sola cumplimiento de un estándar ni eficacia científica de la extracción.

## Referencias metodológicas y técnicas

- Flanagan, J. C. (1954). The critical incident technique. *Psychological Bulletin, 51*(4), 327–358. https://doi.org/10.1037/h0061470
- Klein, G. A., Calderwood, R., & MacGregor, D. (1989). Critical decision method for eliciting knowledge. *IEEE Transactions on Systems, Man, and Cybernetics, 19*(3), 462–472. https://doi.org/10.1109/21.31053
- Kallio, H., Pietilä, A.-M., Johnson, M., & Kangasniemi, M. (2016). Systematic methodological review: Developing a framework for a qualitative semi-structured interview guide. *Journal of Advanced Nursing, 72*(12), 2954–2965. https://doi.org/10.1111/jan.13031
- NIST (2024). *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*. https://doi.org/10.6028/NIST.AI.600-1
- Supabase. *Row Level Security*. https://supabase.com/docs/guides/database/postgres/row-level-security

**La versión beta no debe utilizarse todavía para recopilar información real identificable de trabajadores sin autorización ética/institucional, evaluación de privacidad, términos de tratamiento y periodo de conservación definido.**
