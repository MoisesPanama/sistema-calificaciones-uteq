# Sistema de Registro de Calificaciones — UTEQ

Sistema web para la gestión de calificaciones de un colegio, desarrollado
como proyecto para la materia **Taller de Funciones**, Ingeniería en
Sistemas — Universidad Técnica Estatal de Quevedo (UTEQ).

El sistema permite administrar estudiantes, materias, periodos académicos
y calificaciones, calculando promedios mediante funciones y procedimientos
almacenados de PostgreSQL, con soporte de triggers de validación y
auditoría automática de cambios.

## Integrantes del equipo

- Moises Panama — Backend, base de datos, interfaces de gestión
- *(pendiente asignar)*
- *(pendiente asignar)*

## Stack tecnológico

| Componente         | Tecnología           |
|---------------------|-----------------------|
| Base de datos        | PostgreSQL 18          |
| Backend               | Node.js + Express 5     |
| Motor de vistas        | EJS (renderizado en servidor) |
| Autenticación           | express-session + connect-pg-simple + bcrypt |
| Control de versiones     | Git + GitHub |

## Características principales

- Autenticación con roles (administrador, profesor, representante).
- Gestión de estudiantes, materias y periodos académicos.
- Registro de calificaciones con validación de rango (0–10) mediante
  procedimiento almacenado.
- Cálculo automático de promedios por materia y promedio general, mediante
  funciones de base de datos (el promedio **nunca** se ingresa manualmente).
- Consulta de calificaciones por estudiante, con desglose por parcial.
- Reporte de promedios por periodo, generado con un **cursor explícito**
  en PostgreSQL, tolerante a estudiantes sin calificaciones.
- Panel de auditoría (solo administrador): historial de cambios en todas
  las tablas del sistema, con datos antes/después en JSONB colapsable.
- Triggers de validación (defensa en profundidad) y auditoría genérica
  a nivel de base de datos en **todas las tablas**.
- Selector de quimestre global que persiste al navegar entre páginas.
- Roles de PostgreSQL diferenciados (lectura, profesor, administrador)
  además del control de roles a nivel de aplicación.

## Modelo de base de datos

Esquema `colegio`, normalizado (1FN–3FN), con las siguientes tablas:

`roles`, `usuarios`, `representantes`, `estudiantes`, `profesores`,
`materias`, `periodos_academicos`, `matriculas`,
`profesor_materia_periodo`, `tipos_evaluacion`, `calificaciones`,
`auditoria`, `sesiones`.

### Funciones y procedimientos

| Objeto | Tipo | Descripción |
|--------|------|-------------|
| `fn_promedio_materia` | Función | Promedio ponderado por peso de tipo de evaluación |
| `fn_promedio_general` | Función | Promedio general del estudiante en un periodo |
| `sp_registrar_calificacion` | Procedimiento | Valida rango 0–10 e inserta/actualiza (upsert) una calificación |
| `sp_reporte_promedios_periodo` | Función (cursor) | Recorre estudiantes matriculados y devuelve su promedio, tolerando errores individuales |

### Triggers

- `trg_validar_calificacion` — valida rango 0–10 antes de insertar/actualizar.
- Auditoría genérica sobre **todas las tablas** del sistema
  (registra usuario de la app, operación, y datos antes/después).

## Requisitos previos

- [PostgreSQL 18](https://www.postgresql.org/download/) instalado y en ejecución.
- [Node.js](https://nodejs.org/) v20 o superior.
- Git.

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/MoisesPanama/sistema-calificaciones-uteq.git
cd sistema-calificaciones-uteq
```

### 2. Crear la base de datos y el usuario

Conéctate a PostgreSQL como superusuario (postgres) y ejecuta:

```sql
-- Crear la base de datos
CREATE DATABASE sistema_calificaciones;

-- Crear el usuario de la aplicación
CREATE ROLE app_uteq LOGIN PASSWORD 'tu_password_aqui';

-- Otorgar permisos
GRANT ALL PRIVILEGES ON DATABASE sistema_calificaciones TO app_uteq;
```

### 3. Ejecutar los scripts SQL, en este orden exacto

```bash
psql -U postgres -d sistema_calificaciones -f database/01_schema.sql
psql -U postgres -d sistema_calificaciones -f database/02_functions_procedures.sql
psql -U postgres -d sistema_calificaciones -f database/03_triggers_audit.sql
psql -U postgres -d sistema_calificaciones -f database/04_roles_permissions.sql
psql -U postgres -d sistema_calificaciones -f database/05_seed_data.sql
psql -U postgres -d sistema_calificaciones -f database/06_sesiones.sql
psql -U postgres -d sistema_calificaciones -f database/06_more_data.sql
psql -U postgres -d sistema_calificaciones -f database/07_add_audit_triggers.sql
```

> **Nota:** `04_roles_permissions.sql` crea el usuario `app_uteq` con
> contraseña `cambiar_esta_password`. Si ya lo creaste en el paso 2,
> edita el archivo antes de ejecutarlo o usa `IF NOT EXISTS`.

### 4. Configurar el search_path a nivel de base de datos

```bash
psql -U postgres -d sistema_calificaciones -c "ALTER DATABASE sistema_calificaciones SET search_path TO colegio, public;"
```

### 5. Configurar variables de entorno

```bash
cd backend
cp .env.example .env
```

Edita `.env` con tus datos reales de conexión:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sistema_calificaciones
DB_USER=app_uteq
DB_PASSWORD=tu_password_aqui
PORT=3000
SESSION_SECRET=una_clave_secreta_larga_y_aleatoria
```

### 6. Instalar dependencias

```bash
cd backend
npm install
```

### 7. Ejecutar el servidor

```bash
npm run dev
```

El sistema estará disponible en `http://localhost:3000`.

## Usuarios de prueba

| Email | Contraseña | Rol |
|-------|------------|-----|
| admin@uteq.edu.ec | admin123 | Administrador |
| carla.vera@uteq.edu.ec | profesor123 | Profesor (Matemáticas) |
| jorge.mendoza@uteq.edu.ec | profesor123 | Profesor (Lengua y Literatura) |
| elena.romero@uteq.edu.ec | profesor123 | Profesor (Ciencias Naturales) |
| andres.torres@uteq.edu.ec | profesor123 | Profesor (Estudios Sociales) |
| diana.vargas@uteq.edu.ec | profesor123 | Profesor (Inglés) |

## Estructura del proyecto

```
sistema-calificaciones-uteq/
├── database/
│   ├── 01_schema.sql                  # Esquema completo (13 tablas)
│   ├── 02_functions_procedures.sql    # Funciones y SP
│   ├── 03_triggers_audit.sql          # Triggers de validación y auditoría
│   ├── 04_roles_permissions.sql       # Roles de PostgreSQL
│   ├── 05_seed_data.sql               # Datos iniciales (usuarios, periodos)
│   ├── 06_sesiones.sql                # Tabla de sesiones
│   ├── 06_more_data.sql               # Datos adicionales (10 estudiantes, 8 materias)
│   └── 07_add_audit_triggers.sql      # Triggers de auditoría faltantes
└── backend/
    ├── app.js
    ├── .env.example
    ├── config/
    │   └── db.js
    ├── helpers/
    │   └── periodos.js
    ├── middleware/
    │   └── auth.js
    ├── routes/
    │   ├── auth.js
    │   ├── dashboard.js
    │   ├── estudiantes.js
    │   ├── materias.js
    │   ├── periodos.js
    │   ├── calificaciones.js
    │   ├── consulta.js
    │   ├── reportes.js
    │   ├── auditoria.js
    │   └── tipos_evaluacion.js
    ├── views/
    │   ├── partials/
    │   │   ├── header.ejs
    │   │   └── footer.ejs
    │   ├── login.ejs
    │   ├── dashboard.ejs
    │   ├── error.ejs
    │   ├── estudiantes/
    │   ├── materias/
    │   ├── periodos/
    │   ├── calificaciones/
    │   ├── reportes/
    │   ├── auditoria/
    │   └── tipos_evaluacion/
    └── public/
        └── css/
            └── style.css
```

## Interfaces del sistema

1. Login
2. Dashboard (resumen general)
3. Gestión de estudiantes (listado, búsqueda, crear/editar)
4. Gestión de materias (con asignación de profesor y periodo)
5. Gestión de periodos académicos (estado dinámico por fechas)
6. Registro de control de acceso por profesor
7. Registro de calificaciones
8. Consulta de calificaciones por estudiante (promedios por materia)
9. Reporte de promedios por periodo (Aprobado/Supletorio/Reprobado)
10. Panel de auditoría (solo administrador)
11. Maestro de tipos de evaluación (solo administrador)

## Notas de diseño

- El promedio/nota final **nunca se ingresa manualmente**; siempre se
  calcula mediante funciones de base de datos a partir de calificaciones
  parciales.
- La tabla `auditoria` no tiene claves foráneas hacia otras tablas de
  forma intencional, para poder auditar cambios incluso sobre registros
  que ya fueron eliminados.
- El quimestre seleccionado en el header se persiste en la sesión del
  usuario y se mantiene al navegar entre páginas.
- El estado de los periodos (Activo/Finalizado/Próximo) se calcula
  dinámicamente según las fechas de inicio y fin.

## Licencia

Proyecto académico desarrollado para la materia Taller de Funciones,
UTEQ — 2026. Uso educativo.
