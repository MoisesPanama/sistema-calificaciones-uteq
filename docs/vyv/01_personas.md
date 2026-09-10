# Técnica Personas — Sistema de Registro de Calificaciones

> **Asignatura:** Verificación y Validación de Software — UTEQ
> **Fecha:** Septiembre 2026

---

## Persona 1 — "Lic. Moisés Panamá" (Administrador / Coordinador Académico)

| Atributo | Detalle |
|---|---|
| **Edad** | 35 años |
| **Rol** | Coordinador Académico de la Unidad Educativa |
| **Escolaridad** | Licenciado en Ciencias de la Educación |
| **Experiencia tecnológica** | Media: usa sistemas de ofimática y correo; maneja bien los sistemas web institucionales |
| **Entorno** | Computadora de escritorio en la administración, ventanas amplias |

**Objetivos:**
- Tener un control centralizado y trazable de estudiantes, materias, periodos académicos y calificaciones.
- Garantizar la integridad de la información: que nadie pueda alterar una nota sin que quede registro.
- Generar reportes oficiales de promedios por periodo para entregar a la dirección.

**Necesidades:**
- Crear y mantener el catálogo de estudiantes, materias y periodos.
- Asignar y activar un único periodo académico "en uso".
- Auditar cualquier cambio realizado por los docentes o por él mismo.
- Respaldar la base de datos para evitar pérdida de información.

**Frustraciones:**
- Teme que un docente modifique notas en papel sin dejar rastro.
- Le incomodan los archivos Excel compartidos porque pierden la trazabilidad.
- El cambio de periodo académico debe ser sencillo y seguro (un solo activo a la vez).

**Relación con el sistema:** Utiliza la gestión de estudiantes, materias, periodos, auditoría y respaldos. Orienta la prioridad de las historias de administración, control de acceso y auditoría.

---

## Persona 2 — "Prof. Elena Romero" (Docente)

| Atributo | Detalle |
|---|---|
| **Edad** | 29 años |
| **Rol** | Profesora de Ciencias Naturales (Octavo EGB) |
| **Escolaridad** | Ing. en Ciencias Naturales |
| **Experiencia tecnológica** | Media-alta: usa plataformas educativas (Moodle, Google Classroom) |
| **Entorno** | Laptop personal, conexión a internet del plantel |

**Objetivos:**
- Registrar las calificaciones de sus estudiantes de forma rápida y sin errores de cálculo.
- Ver únicamente las notas de las materias que le corresponden.
- Confiar en que el promedio final se calcule solo y con la fórmula oficial (80% parciales + 20% examen).

**Necesidades:**
- Entrar al módulo "Registrar Nota" y ver su materia asignada.
- Digitar las notas parciales de cada estudiante y guardarlas en masa (tabla completa).
- Corregir una nota si se equivocó (upsert), sabiendo que el cambio quedará auditado.
- Consultar las notas ya registradas en el mismo periodo.

**Frustraciones:**
- En los libros físicos pierde tiempo sumando promedios a mano.
- Le preocupa equivocarse de estudiante al llenar la planilla.

**Relación con el sistema:** Protagonista de las historias de registro de calificaciones y de las validaciones de rango 0–10 y asignación de materia (un profesor solo califica sus materias).

---

## Persona 3 — "Sr. Fernando Castillo" (Representante / Padre de familia)

| Atributo | Detalle |
|---|---|
| **Edad** | 41 años |
| **Rol** | Representante legal del estudiante de Octavo EGB |
| **Escolaridad** | Bachiller |
| **Experiencia tecnológica** | Baja-media: maneja redes sociales y WhatsApp; ha usado portales web de pagos |
| **Entorno** | Teléfono móvil o computador familiar |

**Objetivos:**
- Consultar las notas de su hijo o hija sin tener que ir al plantel.
- Ver los promedios por materia y el promedio general en cada periodo.
- Identificar a tiempo si su representado está en riesgo académico.

**Necesidades:**
- Ingresar con un usuario propio (no necesita permisos de administración).
- Ver SOLO la información de sus hijos (no las de otros estudiantes).
- Navegación simple: seleccionar el hijo y ver el cuadro de notas y promedios.

**Frustraciones:**
- Los formatos impresos se pierden en la mochila.
- No entiende los promedios si no se muestran con una escala clara.

**Relación con el sistema:** Valida la historia de consulta de notas y el control de visibilidad por rol (representante solo ve a sus hijos). Fue usuario clave en la prueba Beta.

---

## Persona 4 — "Lic. María Torres" (Psicóloga Educativa / DECE)

| Atributo | Detalle |
|---|---|
| **Edad** | 33 años |
| **Rol** | Psicóloga del Departamento de Consejería Estudiantil |
| **Escolaridad** | Licenciada en Psicología Educativa |
| **Experiencia tecnológica** | Media: usa sistemas de reportes institucionales |
| **Entorno** | Computadora del DECE |

**Objetivos:**
- Identificar estudiantes con bajo rendimiento o riesgo académico para intervención temprana.
- Ver el desempeño por quimestre y por materia de forma agregada.
- Preparar listados de estudiantes que requieren acompañamiento psicopedagógico.

**Necesidades:**
- Pantalla de "Rendimiento" con resumen de alertas (bajo rendimiento).
- Detalle por estudiante con sus promedios por materia y por periodo.
- No necesita modificar notas: solo lectura de indicadores.

**Frustraciones:**
- Antes dependía de que el docente le pasara capturas de pantalla.
- Necesita datos objetivos, no impresiones.

**Relación con el sistema:** Valida el módulo de psicóloga (rendimiento académico) tanto en las pruebas automatizadas como en las UAT.

---

## Cómo orientaron estas personas el diseño de las pruebas

- **Moisés (admin)** → el peso de las pruebas se puso en: gestión de estudiantes/materias/periodos, activación de un solo periodo, panel de auditoría y respaldos.
- **Elena (profesor)** → se priorizaron las validaciones de rango (0–10), la autorización por materia y el guardado masivo de notas.
- **Fernando (representante)** → se validó la consulta con restricción por rol y la legibilidad de promedios y escala cualitativa.
- **María (psicóloga)** → se automatizó y verificó el panel de rendimiento y el detalle por estudiante.

Estas personas permitieron derivar historias de usuario reales (ver documento de historias) y definir criterios de aceptación orientados a los valores y frecuencia de uso de cada perfil.