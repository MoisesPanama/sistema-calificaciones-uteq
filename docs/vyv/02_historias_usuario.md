# Historias de Usuario y Criterios de Aceptación

> **Asignatura:** Verificación y Validación de Software — UTEQ

Las historias se documentan en formato estándar: **Como [rol], quiero [funcionalidad], para [beneficio]**, con criterios de aceptación verificables. La trazabilidad se mantiene con el código **HU-XX**, usada en los casos de prueba (CP), casos automatizados (AUT) y casos UAT.

---

## HU-01 — Iniciar sesión (administrador)

**Como** administrador, **quiero** iniciar sesión con mi correo y contraseña, **para** acceder a la gestión del sistema.

**Criterios de aceptación:**
1. CA-1: Con credenciales válidas, el usuario es redirigido al dashboard.
2. CA-2: Con contraseña incorrecta, se muestra un mensaje de error y no se inicia sesión.
3. CA-3: Solo los usuarios con `activo = true` pueden ingresar.

## HU-02 — Gestión de estudiantes

**Como** administrador, **quiero** registrar, listar y buscar estudiantes, **para** mantener el registro de matrícula actualizado.

**Criterios de aceptación:**
1. CA-1: Se crea un estudiante con cédula única, nombres, apellidos, fecha de nacimiento y representante.
2. CA-2: La búsqueda por cédula o nombre devuelve las coincidencias.
3. CA-3: Una cédula duplicada es rechazada con mensaje claro (HTTP 409).

## HU-03 — Registro de calificaciones (profesor)

**Como** profesor, **quiero** registrar las notas de mis estudiantes en mi(s) materia(s) asignada(s), **para** que el promedio se calcule automáticamente.

**Criterios de aceptación:**
1. CA-1: El profesor solo ve y edita calificaciones de materias asignadas en el periodo activo.
2. CA-2: Las notas deben estar en el rango 0–10; valores fuera de rango se rechazan.
3. CA-3: El guardado masivo registra todas las celdas modificadas en una sola transacción.
4. CA-4: Si cambia una nota existente, se sobreescribe (upsert) y el cambio queda auditado.
5. CA-5: Un profesor no puede registrar notas de una materia que no tiene asignada (HTTP 403).

## HU-04 — Consulta de calificaciones por estudiante

**Como** representante, **quiero** consultar las notas y promedios de mi(s) hijo(s), **para** dar seguimiento a su rendimiento académico.

**Criterios de aceptación:**
1. CA-1: El representante ve únicamente las notas de sus hijos.
2. CA-2: Se muestran las notas por materia, el promedio por materia y el promedio general del periodo.
3. CA-3: Se muestra la escala cualitativa oficial (Domina / Alcanza / Próximo / No alcanza) según el promedio.

## HU-05 — Reportes de promedios por periodo

**Como** representante (y administrador), **quiero** ver el reporte de promedios del periodo, **para** conocer el desempeño general del curso.

**Criterios de aceptación:**
1. CA-1: El reporte lista estudiantes ordenados por promedio descendente.
2. CA-2: Se puede filtrar por curso y por materia.
3. CA-3: El promedio mostrado coincide con el cálculo de la fórmula oficial del sistema.

## HU-06 — Auditar cambios (administrador)

**Como** administrador, **quiero** consultar el historial de cambios (auditoría), **para** garantizar la integridad y trazabilidad de la información.

**Criterios de aceptación:**
1. CA-1: Solo el rol administrador puede acceder al panel de auditoría.
2. CA-2: Se registran las operaciones INSERT, UPDATE y DELETE con datos antes/después en JSONB.
3. CA-3: Cada registro indica el usuario de la aplicación que realizó el cambio.
4. CA-4: La tabla `auditoria` es de solo lectura + inserción (nadie puede modificar el historial).

## HU-07 — Activación de un único periodo académico

**Como** administrador, **quiero** activar un periodo académico y que exista solo uno activo, **para** que todas las operaciones operen sobre el periodo correcto.

**Criterios de aceptación:**
1. CA-1: Solo puede existir un periodo con `activo = TRUE` (reforzado por índice parcial y trigger).
2. CA-2: Al activar un nuevo periodo, los anteriores quedan inactivos automáticamente.

## HU-08 — Respaldo de la base de datos

**Como** administrador, **quiero** crear y programar respaldos de la base de datos, **para** prevenir pérdida de información.

**Criterios de aceptación:**
1. CA-1: Se puede generar un respaldo manual (pg_dump) desde el panel.
2. CA-2: Se puede programar un respaldo diario con `node-cron`.
3. CA-3: Los respaldos pueden listarse, descargarse y eliminarse (solo admin).

## HU-09 — Rendimiento académico (psicóloga)

**Como** psicóloga, **quiero** ver el rendimiento académico de los estudiantes y las alertas de bajo desempeño, **para** identificar estudiantes que requieren acompañamiento.

**Criterios de aceptación:**
1. CA-1: El panel muestra resumen (total, bajo rendimiento, destacados, promedio general).
2. CA-2: Se listan estudiantes con promedios por quimestre y estado (En Inicio / En Proceso / Logro Esperado / Logro Destacado).
3. CA-3: Un clic en el estudiante abre el detalle con notas por materia y por periodo.

---

## Matriz de trazabilidad resumida (Historias → Tipos de prueba)

| Historia | Casos de prueba manuales | Casos automatizados (Playwright) | Casos UAT |
|---|---|---|---|
| HU-01 Login | CP-01, CP-02 | CP-AUT-01, CP-AUT-02, CP-AUT-09 | UAT-01 |
| HU-02 Estudiantes | CP-03, CP-04 | CP-AUT-03, CP-AUT-04 | UAT-02 |
| HU-03 Calificaciones | CP-05, CP-06, CP-07 | CP-AUT-05 | UAT-03 |
| HU-04 Consulta | CP-08 | CP-AUT-06 | UAT-04 |
| HU-05 Reportes | CP-09 | — | UAT-05 |
| HU-06 Auditoría | CP-10 | CP-AUT-03, CP-AUT-07 | UAT-06 |
| HU-07 Periodo activo | CP-11 | — | — |
| HU-08 Respaldos | CP-12 | CP-AUT-07 | — |
| HU-09 Psicóloga | CP-13 | CP-AUT-08 | UAT-07 |