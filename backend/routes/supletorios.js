// =========================================================
// routes/supletorios.js — Recuperacion (M4 + M7 cierre del ciclo).
// Norma Ecuador: aprueba con 7; el <7 va a supletorio, luego
// remedial y de gracia (instancia), en ese orden.
// Al VALIDAR se cierra el estado de la materia con
// fn_cerrar_recuperacion (validada >=7 -> 'aprobado', si no
// -> 'reprobado'). NO recalcula promedios.
// Elegibilidad (<7) se verifica en el SERVIDOR con
// fn_promedio_materia, nunca en el navegador.
// Permisos: ver/registrar = admin o profesor asignado a la
// materia+curso; validar = solo admin.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const {
    getPeriodoActivo,
    getMateriasPermitidas,
    getCursosPermitidos
} = require('../helpers/contexto');

// Promedio anual via BD; null si no hay notas (P0001).
async function promedioAnual(conn, idEstudiante, idMateria, idPeriodo) {
    try {
        const r = await conn.query(
            'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
            [idEstudiante, idMateria, idPeriodo]
        );
        return r.rows[0] ? r.rows[0].promedio : null;
    } catch (error) {
        if (error.code === 'P0001') return null;
        throw error;
    }
}

function soloDocenteOAdmin(usuario) {
    const rol = usuario && usuario.nombre_rol;
    return rol === 'administrador' || rol === 'profesor';
}

async function materiaPermitida(usuario, idPeriodo, idMateria) {
    const materias = await getMateriasPermitidas(pool, usuario, idPeriodo);
    return materias.some((m) => String(m.id_materia) === String(idMateria));
}

async function cursoPermitido(usuario, idPeriodo, idCurso) {
    if (!idCurso) return true;
    const cursos = await getCursosPermitidos(pool, usuario, idPeriodo);
    return cursos.some((c) => String(c.id_curso) === String(idCurso));
}

const INSTANCIAS = ['supletorio', 'remedial', 'gracia'];

// Siguiente instancia permitida segun las ya registradas.
// null = ciclo cerrado o hay una pendiente de validar/editar.
function siguienteInstancia(instancias) {
    const sup = instancias.supletorio;
    if (!sup) return 'supletorio';
    if (sup.estado !== 'validado') return null;
    if (Number(sup.nota) >= 7) return null;
    const rem = instancias.remedial;
    if (!rem) return 'remedial';
    if (rem.estado !== 'validado') return null;
    if (Number(rem.nota) >= 7) return null;
    const gra = instancias.gracia;
    if (!gra) return 'gracia';
    return null;
}

// GET /api/supletorios?id_periodo=&id_materia=&id_curso=
// Nomina con promedio anual + elegibilidad + instancias + estado final.
router.get('/', requireAuth, async (req, res) => {
    try {
        if (!soloDocenteOAdmin(req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes permiso para ver supletorios.' });
        }
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.json({ supletorios: [] });
        const idMateria = req.query.id_materia || '';
        const idCurso = req.query.id_curso || '';
        if (!idMateria) return res.status(400).json({ error: 'Debe seleccionar una materia.' });

        if (!(await materiaPermitida(req.session.usuario, idPeriodo, idMateria))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }
        if (idCurso && !(await cursoPermitido(req.session.usuario, idPeriodo, idCurso))) {
            return res.status(403).json({ error: 'No tiene asignado este curso en el periodo.' });
        }

        const r = await pool.query(
            `SELECT e.id_estudiante, e.nombres, e.apellidos, e.cedula,
                    m.id_curso, c.nombre AS curso_nombre, c.paralelo,
                    mm.estado AS estado_materia,
                    s.id_supletorio, s.instancia, s.nota AS supletorio_nota,
                    s.estado AS supletorio_estado
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             LEFT JOIN cursos c ON c.id_curso = m.id_curso
             LEFT JOIN matricula_materias mm ON mm.id_matricula = m.id_matricula
                AND mm.id_materia = $2
             LEFT JOIN supletorios s ON s.id_estudiante = e.id_estudiante
                AND s.id_materia = $2 AND s.id_periodo = $1
             WHERE m.id_periodo = $1
               AND ($3::int IS NULL OR m.id_curso IS NULL OR m.id_curso = $3::int)
             ORDER BY e.apellidos, e.nombres, s.id_supletorio`,
            [idPeriodo, idMateria, idCurso || null]
        );

        const porEstudiante = new Map();
        for (const row of r.rows) {
            if (!porEstudiante.has(row.id_estudiante)) {
                porEstudiante.set(row.id_estudiante, {
                    id_estudiante: row.id_estudiante,
                    nombres: row.nombres,
                    apellidos: row.apellidos,
                    cedula: row.cedula,
                    id_curso: row.id_curso,
                    curso_nombre: row.curso_nombre,
                    paralelo: row.paralelo,
                    estado_materia: row.estado_materia,
                    instancias: {}
                });
            }
            const est = porEstudiante.get(row.id_estudiante);
            if (row.id_supletorio) {
                est.instancias[row.instancia] = {
                    id_supletorio: row.id_supletorio,
                    nota: row.supletorio_nota,
                    estado: row.supletorio_estado
                };
            }
        }

        const filas = [];
        for (const est of porEstudiante.values()) {
            const promedio = await promedioAnual(pool, est.id_estudiante, idMateria, idPeriodo);
            const num = promedio === null || promedio === undefined ? null : Number(promedio);
            const sup = est.instancias.supletorio || null;
            filas.push({
                ...est,
                // Compat: id_supletorio = instancia supletorio (o null).
                id_supletorio: sup ? sup.id_supletorio : null,
                supletorio_nota: sup ? sup.nota : null,
                supletorio_estado: sup ? sup.estado : null,
                promedio_anual: num,
                elegible: num !== null && num < 7,
                siguiente: (num !== null && num < 7) ? siguienteInstancia(est.instancias) : null
            });
        }
        res.json({ supletorios: filas });
    } catch (error) {
        console.error('Error al listar supletorios:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los supletorios.' });
    }
});

// POST /api/supletorios {id_estudiante,id_materia,id_periodo?,id_curso?,nota,instancia?}
// Orden obligatorio: supletorio -> remedial (supletorio validado <7)
// -> gracia (remedial validado <7).
router.post('/', requireAuth, async (req, res) => {
    try {
        if (!soloDocenteOAdmin(req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes permiso para registrar supletorios.' });
        }
        const { id_estudiante, id_materia, id_curso, nota } = req.body || {};
        if (!id_estudiante) return res.status(400).json({ error: 'Falta el estudiante.' });
        if (!id_materia) return res.status(400).json({ error: 'Falta la materia.' });
        const instancia = (req.body || {}).instancia || 'supletorio';
        if (!INSTANCIAS.includes(instancia)) {
            return res.status(400).json({ error: 'Instancia invalida (supletorio, remedial o gracia).' });
        }
        const valor = Number(String(nota).replace(',', '.'));
        if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
            return res.status(400).json({ error: 'La nota debe estar entre 0 y 10.' });
        }
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = (req.body || {}).id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.status(500).json({ error: 'No hay periodos registrados.' });

        if (!(await materiaPermitida(req.session.usuario, idPeriodo, id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }
        if (id_curso && !(await cursoPermitido(req.session.usuario, idPeriodo, id_curso))) {
            return res.status(403).json({ error: 'No tiene asignado este curso en el periodo.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const rMat = await client.query(
                'SELECT id_matricula FROM matriculas WHERE id_estudiante = $1 AND id_periodo = $2',
                [id_estudiante, idPeriodo]
            );
            if (rMat.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'El estudiante no esta matriculado en este periodo.' });
            }
            const promedio = await promedioAnual(client, id_estudiante, id_materia, idPeriodo);
            if (promedio === null) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Sin promedio anual: registra notas primero.' });
            }
            if (Number(promedio) >= 7) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: `Promedio ${Number(promedio)}: solo el menor a 7 va a supletorio.` });
            }
            const rPrev = await client.query(
                `SELECT instancia, nota, estado FROM supletorios
                 WHERE id_estudiante = $1 AND id_materia = $2 AND id_periodo = $3`,
                [id_estudiante, id_materia, idPeriodo]
            );
            const prev = {};
            for (const p of rPrev.rows) prev[p.instancia] = p;
            const anterior = instancia === 'remedial' ? 'supletorio' : (instancia === 'gracia' ? 'remedial' : null);
            if (anterior) {
                const a = prev[anterior];
                if (!a) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: `Sin ${anterior} previo: respeta el orden supletorio -> remedial -> gracia.` });
                }
                if (a.estado !== 'validado' || Number(a.nota) >= 7) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: `El ${anterior} debe estar validado con nota <7 para abrir ${instancia}.` });
                }
                if (prev[instancia]) {
                    await client.query('ROLLBACK');
                    if (prev[instancia].estado === 'validado') {
                        return res.status(409).json({ error: `${instancia} ya validado: acta congelada.` });
                    }
                    return res.status(409).json({ error: `Ya tiene ${instancia} registrado: editalo.` });
                }
            } else if (prev[instancia]) {
                await client.query('ROLLBACK');
                if (prev[instancia].estado === 'validado') {
                    return res.status(409).json({ error: 'Supletorio ya validado: acta congelada, no se puede editar.' });
                }
                return res.status(409).json({ error: 'Ya tiene supletorio registrado: editalo en vez de crear otro.' });
            }
            const r = await client.query(
                `INSERT INTO supletorios (id_estudiante, id_materia, id_periodo, id_curso, nota, instancia, creado_por)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_supletorio`,
                [id_estudiante, id_materia, idPeriodo, id_curso || null, valor, instancia, req.session.usuario.id_usuario]
            );
            await client.query('COMMIT');
            res.status(201).json({ ok: true, id_supletorio: r.rows[0].id_supletorio });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe supletorio para ese estudiante y materia.' });
        }
        console.error('Error al registrar supletorio:', error.message);
        res.status(500).json({ error: 'No se pudo registrar el supletorio.' });
    }
});

// PUT /api/supletorios/:id {nota} (solo registrado, no validado)
router.put('/:id', requireAuth, async (req, res) => {
    try {
        if (!soloDocenteOAdmin(req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes permiso.' });
        }
        const valor = Number(String((req.body || {}).nota).replace(',', '.'));
        if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
            return res.status(400).json({ error: 'La nota debe estar entre 0 y 10.' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const rSup = await client.query('SELECT * FROM supletorios WHERE id_supletorio = $1', [req.params.id]);
            if (rSup.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Supletorio no encontrado.' });
            }
            const sup = rSup.rows[0];
            if (sup.estado === 'validado') {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Acta validada: no se puede editar.' });
            }
            if (!(await materiaPermitida(req.session.usuario, sup.id_periodo, sup.id_materia))) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'No tiene asignada esta materia.' });
            }
            await client.query(
                'UPDATE supletorios SET nota = $1 WHERE id_supletorio = $2',
                [valor, req.params.id]
            );
            await client.query('COMMIT');
            res.json({ ok: true, mensaje: 'Nota actualizada.' });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al editar supletorio:', error.message);
        res.status(500).json({ error: 'No se pudo editar.' });
    }
});

// POST /api/supletorios/:id/validar (solo admin: congela el acta
// y cierra el estado de la materia con fn_cerrar_recuperacion)
router.post('/:id/validar', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `UPDATE supletorios SET estado = 'validado', validado_por = $1, fecha_validacion = NOW()
             WHERE id_supletorio = $2 AND estado = 'registrado'
             RETURNING id_supletorio, id_estudiante, id_materia, id_periodo, instancia, nota`,
            [req.session.usuario.id_usuario, req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Supletorio no encontrado o ya validado.' });
        }
        const sup = r.rows[0];
        const rCierre = await client.query(
            'SELECT fn_cerrar_recuperacion($1, $2, $3) AS estado_final',
            [sup.id_estudiante, sup.id_materia, sup.id_periodo]
        );
        await client.query('COMMIT');
        res.json({
            ok: true,
            mensaje: `Supletorio validado: acta congelada (materia: ${rCierre.rows[0].estado_final || 'sin cambio'}).`,
            estado_final: rCierre.rows[0].estado_final
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al validar supletorio:', error.message);
        res.status(500).json({ error: 'No se pudo validar.' });
    } finally {
        client.release();
    }
});

// DELETE /api/supletorios/:id (solo registrado)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        if (!soloDocenteOAdmin(req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes permiso.' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const rSup = await client.query('SELECT * FROM supletorios WHERE id_supletorio = $1', [req.params.id]);
            if (rSup.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Supletorio no encontrado.' });
            }
            const sup = rSup.rows[0];
            if (sup.estado === 'validado') {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Acta validada: no se puede borrar.' });
            }
            const esAdmin = req.session.usuario.nombre_rol === 'administrador';
            if (!esAdmin && Number(sup.creado_por) !== Number(req.session.usuario.id_usuario)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Solo el admin o quien lo registro puede borrarlo.' });
            }
            await client.query('DELETE FROM supletorios WHERE id_supletorio = $1', [req.params.id]);
            await client.query('COMMIT');
            res.json({ ok: true, mensaje: 'Supletorio eliminado.' });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al eliminar supletorio:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar.' });
    }
});

module.exports = router;
