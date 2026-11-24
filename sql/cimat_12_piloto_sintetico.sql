-- Beta.2: los controles negativos del piloto pueden no tener coincidencia esperada.
ALTER TABLE public.cimat_12_casos_piloto ALTER COLUMN esperado_origen_tipo DROP NOT NULL;
ALTER TABLE public.cimat_12_casos_piloto ALTER COLUMN esperado_origen_id DROP NOT NULL;
ALTER TABLE public.cimat_12_resultados_piloto ALTER COLUMN falsos_positivos_top5 DROP NOT NULL;
ALTER TABLE public.cimat_12_casos_piloto ADD CONSTRAINT cimat_12_piloto_par_expectativa
 CHECK((esperado_origen_tipo IS NULL AND esperado_origen_id IS NULL) OR
       (esperado_origen_tipo IS NOT NULL AND esperado_origen_id IS NOT NULL));

-- Casos sintéticos con una sola referencia positiva explícita; no son observaciones de campo.
WITH cases(titulo,ocupacion,consulta,tipo,busca) AS (VALUES
 ('Riesgos en un proyecto','Responsable de proyecto',
  'En mi trabajo identifico y documento riesgos que pueden afectar al proyecto, reviso obstáculos y registro las amenazas conocidas.','tarea',
  'Identificar y documentar los riesgos del proyecto'),
 ('Cronograma de ejecución','Coordinación de trabajo',
  'Organizo el cronograma de tareas con fechas de inicio y fin para coordinar el proyecto.','tarea',
  'Establecer el cronograma de tareas del proyecto'),
 ('Repositorio documental','Gestión de configuración',
  'Para controlar los cambios establezco el repositorio del proyecto utilizando una estrategia de control de versiones.','tarea',
  'Establecer el Repositorio del Proyecto'),
 ('Planificación de recursos','Administración de proyectos',
  'Documentamos los recursos humanos materiales equipo y herramientas necesarios para realizar las tareas.','tarea',
  'Identificar  y documentar  los  Recursos: humanos, materiales, equipo y herramientas'),
 ('Aprobación de planificación','Supervisión de proyectos',
  'Verifico y obtengo la aprobación del Plan del Proyecto antes de iniciar la siguiente etapa.','tarea',
  'Verificar y obtener aprobación del Plan del Proyecto'),
 ('Evidencia de verificación','Personal de calidad',
  'Después de hacer comprobaciones guardo los Resultados de Verificación y sus observaciones.','producto',
  'Resultados de Verificación'),
 ('Control negativo: panadería','Panadería',
  'Enciendo el horno, amaso los bolillos, espero la fermentación de la masa y horneo el pan para el mostrador.','producto',
  '__sin_coincidencia__'),
 ('Control negativo: cuidado de plantas','Jardinería',
  'Riego las plantas, observo las hojas marchitas, preparo el sustrato y podo los tallos dañados.','tarea',
  '__sin_coincidencia__')
), targets AS (
 SELECT c.*,e.id objetivo_id,e.dominio_id
 FROM cases c JOIN LATERAL (
  SELECT t.id,t.dominio_id FROM public.cimat_0852_tareas t
   WHERE c.tipo='tarea' AND t.nombre=c.busca
  UNION ALL
  SELECT p.id,p.dominio_id FROM public.cimat_0852_productos p
   WHERE c.tipo='producto' AND p.nombre=c.busca
  LIMIT 1
 ) e ON true
)
INSERT INTO public.cimat_12_casos_piloto(titulo,ocupacion,consulta,esperado_origen_tipo,esperado_origen_id,dominio_id,escenario)
SELECT titulo,ocupacion,consulta,tipo,objetivo_id,dominio_id,'Ejemplo sintético con una referencia seleccionada'
FROM targets
ON CONFLICT(titulo) DO NOTHING;

INSERT INTO public.cimat_12_casos_piloto(titulo,ocupacion,consulta,esperado_origen_tipo,esperado_origen_id,dominio_id,escenario)
SELECT c.titulo,c.ocupacion,c.consulta,NULL,NULL,d.id,'Control negativo ficticio'
FROM (VALUES
 ('Control negativo: panadería','Panadería',
  'Enciendo el horno, amaso los bolillos, espero la fermentación de la masa y horneo el pan para el mostrador.'),
 ('Control negativo: cuidado de plantas','Jardinería',
  'Riego las plantas, observo las hojas marchitas, preparo el sustrato y podo los tallos dañados.')
) c(titulo,ocupacion,consulta)
CROSS JOIN LATERAL (SELECT id FROM public.dominios_conocimiento WHERE estado='registrado' ORDER BY creado_en DESC LIMIT 1) d
ON CONFLICT(titulo) DO NOTHING;
