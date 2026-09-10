# Registro de Observaciones de la Prueba Beta

> **Asignatura:** Verificación y Validación de Software — UTEQ
> Datos simulados para la defensa, basados en la bitácora de los participantes B1–B6.

---

## Observaciones por participante

| Participante | Errores/Incidencias | Dificultades de uso | Comentarios | Sugerencias |
|---|---|---|---|---|
| **B1 Fernando (Representante)** | Ninguno (Flujo funcional correcto) | Le costó ubicar al inicio el selector de estudiante | "Pude ver las notas de mi hija sin salir de casa" | "Que la página recuerde el estudiante seleccionado" |
| **B2 Patricia (Representante)** | Ninguno | En el teléfono, la tabla se veía angosta | "Es sencillo, lo veo en el celular" | "Mejorar la vista de tablas en pantallas pequeñas" |
| **B3 Elena (Docente)** | Ninguno | Al iniciar, debía elegir materia; después fue claro | "Registrar las notas en bloque me ahorró tiempo" | "Poder cambiar una nota sin recargar la página" |
| **B4 Jorge (Docente)** | Ninguno | Ninguna | "El promedio sale solo, ya no uso la calculadora" | "Poder exportar la planilla a Excel/CSV" |
| **B5 María (Psicóloga)** | Ninguno | Ninguna | "Identifiqué rápido a los estudiantes con riesgo" | "Agregar un gráfico de tendencia por quimestre" |
| **B6 Luis (Admin)** | Ninguno | Ninguna | "La auditoría me da tranquilidad sobre los cambios" | "Que el respaldo se pueda descargar desde el panel" |

## Consolidado de observaciones

| Categoría | Cantidad | Detalle |
|---|---|---|
| Errores funcionales (bugs) | 0 | No se reportaron fallos que impidan operar |
| Dificultades de uso | 2 | Selector de estudiante poco visible (B1); tabla angosta en móvil (B2) |
| Sugerencias de mejora | 6 | Recordar estudiante, responsividad, edición sin recarga, exportar CSV/Excel, gráfico de tendencia, descargar respaldo |

## Priorización y acciones de mejora definidas

| Prioridad | Sugerencia | Acción tomada | Estado |
|---|---|---|---|
| ALTA | Editar una nota sin recargar la página | El registro manual ya guarda por fila (upsert) sin recargar pantalla; se verifica en la consulta inmediata | ✅ Implementado/verificado |
| ALTA | Descargar el respaldo desde el panel | Se habilita el endpoint de descarga del backup mediante el admin | ✅ Verificado en CP-12/UAT (ruta) |
| MEDIA | Recordar el estudiante seleccionado | Se recomienda persistir el último estudiante en `localStorage` | ⏳ En backlog de mejoras |
| MEDIA | Exportar planilla a Excel/CSV | Se sugiere endpoint de exportación CSV | ⏳ En backlog de mejoras |
| MEDIA | Vista de tablas en móvil | Se recomienda optimizar tablas con scroll horizontal y tipografía menor | ⏳ En backlog de mejoras |
| BAJA | Gráfico de tendencia por quimestre (psicóloga) | Se propone gráfica con Chart.js | ⏳ En backlog de mejoras |

## Conclusiones de la Beta

- El sistema cumplió sus funciones esenciales sin errores funcionales durante la semana de prueba.
- Los representantes valoraron la consulta remota de notas; los docentes, el guardado masivo y el cálculo automático.
- La psicóloga y el administrador validaron las funciones de rendimiento y auditoría.
- Las mejoras detectadas son de tipo **usabilidad y enriquecimiento**, no de corrección de errores.
- El sistema se considera **estable para la versión 1.0** con las mejoras prioritarias ya cubiertas por el equipo.