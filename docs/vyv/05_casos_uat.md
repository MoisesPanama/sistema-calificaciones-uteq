# Casos de Prueba de Aceptación del Usuario (UAT)

> **Asignatura:** Verificación y Validación de Software — UTEQ
> **Participantes:** usuarios finales simulados según la técnica Personas (administrador, docente, representante, psicóloga).

Los casos UAT validan que el sistema cumple con **el criterio de aceptación del usuario**, no solo con la implementación técnica. Cada caso referencia su historia de usuario y su criterio de aceptación.

---

## UAT-01 — "Puedo entrar a mi cuenta de administrador"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-01 / CA-1 |
| Rol | Administrador (Moisés) |
| Pasos | Abrir el sistema → ingresar correo y contraseña → confirmar acceso |
| Datos | `admin@uteq.edu.ec` / `UTEQ2026` |
| Resultado esperado | Veo mi panel de administración con mi nombre |
| Resultado obtenido | Acceso correcto al dashboard, nombre y rol visibles |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/uat-01_login_admin.png` |

## UAT-02 — "Puedo registrar y buscar estudiantes"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-02 / CA-1, CA-2 |
| Rol | Administrador |
| Pasos | Abrir Estudiantes → registrar un nuevo estudiante → buscarlo por cédula |
| Datos | Estudiante de prueba UAT-02; cédula única |
| Resultado esperado | El estudiante aparece en la lista y es localizable por cédula |
| Resultado obtenido | Registro exitoso y búsqueda devuelve la fila correcta |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/uat-02_estudiantes.png` |

## UAT-03 — "Puedo registrar las notas de mi materia fácilmente"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-03 / CA-1 a CA-4 |
| Rol | Profesora (Elena) |
| Pasos | Abrir Calificaciones → elegir mi materia → digitar notas 0–10 → guardar todo |
| Datos | Materia: Ciencias Naturales; notas parciales válidas |
| Resultado esperado | Todas las notas se guardan a la vez y veo confirmación |
| Resultado obtenido | "Se guardaron N calificaciones." y notas reflejadas en consulta |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/uat-03b_profesor_notas.png` |

## UAT-04 — "Veo las notas de mi hijo sin ver las de otros"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-04 / CA-1, CA-2 |
| Rol | Representante (Fernando) |
| Pasos | Ingresar → elegir a mi hijo → revisar notas y promedio |
| Datos | Hijo: Isabella Castillo |
| Resultado esperado | Solo veo las notas de mis hijos, con promedio y escala |
| Resultado obtenido | Consulta restringida correctamente a los hijos del representante |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/uat-04b_consulta_representante.png` |

## UAT-05 — "Veo el reporte de promedios del periodo"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-05 / CA-1 a CA-3 |
| Rol | Administrador |
| Pasos | Abrir Reportes → seleccionar periodo y consultar |
| Datos | Periodo activo (2026-2027 Primer Quimestre) |
| Resultado esperado | Listado ordenado por promedio con escala cualitativa |
| Resultado obtenido | 10 estudiantes ordenados de mayor a menor promedio |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/uat-05_reportes.png` |

## UAT-06 — "Puedo auditar qué cambió y quién lo hizo"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-06 / CA-1 a CA-4 |
| Rol | Administrador |
| Pasos | Abrir Auditoría → revisar operaciones → confirmar que un rol no administrador NO puede verla |
| Datos | Registros generados previamente (ej. notas de Elena) |
| Resultado esperado | Veo tabla de auditoría con datos antes/después y el usuario que operó |
| Resultado obtenido | Más de 1000 registros con JSONB y usuario de la app; bloqueo a no-admin verificado |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/playwright-03-admin-auditoria.png` · `evidencias/e2e_test_repo_66.txt` |

## UAT-07 — "La psicóloga ve el rendimiento de los estudiantes para dar acompañamiento"

| Atributo | Valor |
|---|---|
| Historia / Criterio | HU-09 / CA-1 a CA-3 |
| Rol | Psicóloga (María) |
| Pasos | Abrir panel de psicóloga → revisar resumen → abrir detalle de un estudiante |
| Datos | Periodo activo |
| Resultado esperado | Resumen de rendimiento, listado de estudiantes y detalle por materia |
| Resultado obtenido | Resumen con total y alertas, y detalle por estudiante |
| Aceptación | ✅ **ACEPTADO** |
| Evidencia | `evidencias/uat-07b_psicologa_panel.png` |

---

## Resumen UAT

| # | Historia | Resultado | Decisión |
|---|---|---|---|
| UAT-01 | HU-01 | ✅ PASS | ACEPTADO |
| UAT-02 | HU-02 | ✅ PASS | ACEPTADO |
| UAT-03 | HU-03 | ✅ PASS | ACEPTADO |
| UAT-04 | HU-04 | ✅ PASS | ACEPTADO |
| UAT-05 | HU-05 | ✅ PASS | ACEPTADO |
| UAT-06 | HU-06 | ✅ PASS | ACEPTADO |
| UAT-07 | HU-09 | ✅ PASS | ACEPTADO |

**Conclusión UAT:** el 100% de los criterios de aceptación definidos por el usuario fueron cumplidos. El sistema queda **aprobado para producción** por el usuario final.