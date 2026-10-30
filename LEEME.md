# CIMAT — Plataforma web v0.7.1

Plataforma académica de extracción de conocimiento tácito con **dominios documentales configurables**.

## Estado funcional

- Autenticación, administración global, empresas, usuarios, invitaciones y roles: módulos anteriores.
- Biblioteca privada: registro de dominios documentales y carga de PDF, DOCX y TXT.
- Procesamiento v0.7: extracción de texto PDF por página, detección de encabezados candidatos y revisión.
- **Modelo v0.7.1:** catálogo independiente de la metodología con siete clases: proceso, actividad, tarea, rol, producto de trabajo, componente y concepto.
- Relaciones dirigidas: contiene, participa, ejecuta, utiliza, genera, actualiza, verifica, precede y referencia.
- Trazabilidad de elementos y relaciones hacia dominio, documento y página física del PDF.
- Estados **propuesto / aprobado / descartado** con comprobaciones de fuente y registro de revisión.
- Vista gráfica dinámica: roles a la izquierda, tareas en el centro y productos y componentes a la derecha. Su contenido procede de la base de datos, no de una imagen estática.

## Ejemplo controlado

Para el dominio ISO/IEC TR 29110-5-1-2:2011 se incorporó una muestra de **11 elementos y 10 relaciones** alrededor de la tarea PM.1.1, *Review the Statement of Work* (GP1.1 en el diagrama de referencia del proyecto). Incluye un proceso, una actividad, una tarea, dos roles, dos representaciones de producto y cuatro componentes. **Todo permanece en estado propuesto**, pendiente de verificación frente al PDF cargado. No debe tratarse como extracción semántica automática ni evaluación de conformidad.

## Arquitectura y seguridad

- Tablas `conocimiento_elementos` y `conocimiento_relaciones` en PostgreSQL; separación por `dominio_id`.
- Restricciones de integridad impiden asociar elementos y documentos de distintos dominios o relaciones entre dominios incompatibles.
- RLS: catálogo editable y consultable desde la interfaz solo por administradores globales. No se habilita el catálogo para el rol Empresa.
- Los documentos están almacenados en el bucket privado `cimat-privado`.
- La autoría y revisión se documentan en base de datos; la aprobación **no** equivale a certificación ISO.
- RF-SEG-01 continúa vigente: las identidades y entrevistas no deben exponerse al rol Empresa.

## Cómo probar

1. Abrir [CIMAT](https://iscrod.github.io/cimat-conocimiento-web/) e iniciar sesión como administrador.
2. Ir a **Modelo y diagramas**.
3. Seleccionar el dominio registrado ISO/IEC 29110, edición 2011.
4. Visualizar el ejemplo de planificación del proyecto, revisar las 11 fichas y las 10 relaciones.
5. Antes de aprobar un elemento, abrir el documento en **Biblioteca**, comprobar el contenido y su página original. No aprobar si la evidencia no coincide.
6. Añadir o modificar elementos de prueba para observar cómo cambia el diagrama.

## Pendiente

- Verificación humana de los elementos y de las páginas documentales de la muestra.
- Pruebas de autorización con una cuenta no administrativa y validación visual completa en navegador.
- Extracción semántica automática general (v0.8), interpretaciones de IA con fuentes, propuestas de relaciones y revisión experta.
- Generación de cuestionarios y entrevistas basadas en el modelo de referencia.

## Referencias técnicas oficiales

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [GitHub Pages](https://docs.github.com/en/pages)
