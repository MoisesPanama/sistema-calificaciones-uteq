# Archivos obsoletos — database/_obsoletos

Estos archivos se conservaron por historial pero **ya no forman parte del flujo activo**:

- `fix_tables.sql` — parche temprano para crear `cursos/ciclos/parciales`; reemplazado por `07_periodo_activo_cursos_ciclos.sql` + `08_tipos_matricula_detalle.sql` y `15_triggers_catalogos.sql`. Contiene `GRANT ALL` que contradice `13_permisos_minimos.sql` y usa nombre de BD antiguo `sistema_calificaciones`.
- `init-db.sh` — inicializador Docker legacy que montaba migraciones en `/docker-entrypoint-initdb.d/sql`; el flujo actual usa `backend/docker-entrypoint.sh` y `backend/Dockerfile` (ver `docker-compose.yml`).

No se ejecutan en `setup.ps1`, `up.sh`/`up.ps1` ni en `docker-compose.yml`. Se mantienen aquí solo como referencia histórica.
