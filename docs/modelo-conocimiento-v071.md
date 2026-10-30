# CIMAT v0.7.1 — Modelo de conocimiento estructurado

## Propósito

Representar en una estructura reutilizable los componentes de **un dominio documental** y sus relaciones, para posteriormente comparar lo establecido en la norma o metodología con el proceso observado en entrevistas. No se mezclan datos de cumplimiento, respuestas individuales ni diagramas empresariales en esta etapa.

## Entidades

- `public.conocimiento_elementos`: elemento tipado como `proceso`, `actividad`, `tarea`, `rol`, `producto`, `componente` o `concepto`.
- `public.conocimiento_relaciones`: relación dirigida entre dos elementos del mismo dominio. Tipos: `contiene`, `participa`, `ejecuta`, `utiliza`, `genera`, `actualiza`, `verifica`, `precede` y `referencia`.
- Relación de procedencia: `dominio_id`, `documento_id`, `pagina`. Se valida que la página exista y que el archivo pertenezca al dominio.
- Identidad y auditoría de revisión: `creado_por`, `creado_en`, `revisado_por`, `revisado_en`, `estado`. Los cambios materiales de un elemento aprobado requieren regresarlo previamente a `propuesto`.

## Estados

1. **Propuesto:** candidato estructurado sin verificación experta.
2. **Aprobado:** un administrador revisó el elemento asociado a una página documental; *no* implica conformidad de una empresa con la norma.
3. **Descartado:** elemento o relación excluido de la vista del diagrama.

Actualmente solo el **administrador global** puede leer, crear o revisar este catálogo. RLS protege ambas tablas; no hay acceso directo para `anon` ni para usuarios empresariales. El modelo no muestra las identidades de entrevistados ni respuestas individuales (RF-SEG-01).

## Datos iniciales del caso de prueba

El documento cargado es **ISO/IEC TR 29110-5-1-2:2011(E)**, registrado como dominio de referencia para pruebas.

Se configuró una propuesta inicial para `PM` Project Management, `PM.1` Project Planning y `PM.1.1` Review the Statement of Work. El PDF utiliza la abreviatura inglesa **PM** mientras que el diagrama en español compartido como referencia emplea **GP**. No deben tratarse como identificadores independientes sin documentar la equivalencia.

- Página PDF 12: proceso Project Management.
- Página PDF 18: PM.1 y PM.1.1; roles PM y TL; entrada Statement of Work y salida Statement of Work [reviewed].
- Página PDF 20: se enumeran Product Description, Scope, Objectives y Deliverables como información del Statement of Work en la tarea PM.1.12.

Estos elementos y relaciones se almacenan en estado **propuesto**, aunque haya página identificada. Es responsabilidad del experto validar el contenido completo y sus asociaciones antes de aprobarlo.

### Precisión metodológica

Que una persona manifieste que el Enunciado de Trabajo contiene descripción, alcance, objetivos y entregables **no prueba por sí solo cumplimiento integral** de ISO/IEC 29110. Hay que revisar la edición aplicable, todos los requisitos y productos, su evidencia y el proceso de revisión. Además, debe distinguirse `Statement of Work` del `Project Plan`; PM.1.12 utiliza información del primero para incorporar contenido al segundo.

## Vista gráfica

La pestaña **Modelo y diagramas** ofrece un editor manual y un diagrama generado dinámicamente a partir de las tablas:

- Izquierda: roles vinculados a cada tarea.
- Centro: tareas, agrupadas por actividad y ordenadas.
- Derecha: productos de entrada/salida y sus componentes.

La visualización expresa las relaciones guardadas, no una inferencia automática ni un dictamen de auditoría. Todavía no interpreta automáticamente la norma con IA, no ejecuta entrevistas y no evalúa cumplimiento.

## Próxima etapa

CIMAT v0.8: analizador semántico del dominio que proponga, **con procedencia documental verificable**, nuevos elementos y relaciones para revisión humana. La estructura general permanece independiente de ISO/IEC 29110.

## Referencias

- Documento autorizado almacenado en Supabase Storage privado: ISO/IEC TR 29110-5-1-2:2011(E), especialmente páginas físicas 12, 18 y 20.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
