# Sistema de Registro de Calificaciones - UTEQ

Sistema web para gestión de calificaciones escolares, desarrollado como
proyecto del Taller de Funciones (Ingeniería en Sistemas, UTEQ, Ecuador).

## Stack tecnológico

- **Base de datos:** PostgreSQL
- **Backend:** Node.js + Express
- **Vistas:** EJS (renderizado en servidor)
- **Control de versiones:** Git + GitHub

## Funcionalidades de base de datos

- Esquema normalizado hasta 3FN
- Funciones: cálculo de promedio por materia y promedio general
- Procedimiento almacenado con validación (upsert de calificaciones)
- Función con cursor explícito para reporte de promedios por período
- Triggers de validación (rango 0-10) y de auditoría (INSERT/UPDATE/DELETE)
- Roles de base de datos con permisos diferenciados (lectura, profesor, admin)

## Interfaces del sistema

1. Login
2. Dashboard
3. Listado de estudiantes
4. Formulario de estudiante (crear/editar)
5. Gestión de materias
6. Gestión de períodos académicos
7. Registro de calificaciones
8. Consulta de calificaciones por estudiante
9. Reportes de promedios (individual y por período)
10. Panel de auditoría

## Integrantes

- Moisés Panamá

## Instalación

Instrucciones de instalación pendientes (se agregarán al finalizar el backend).