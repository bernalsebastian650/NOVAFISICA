/**
 * NOVAFÍSICA - Gestor de Progreso (estado + persistencia).
 *
 * Única puerta de acceso a localStorage y a las métricas del usuario.
 * No toca el DOM ni los toasts: notifica cambios mediante eventos (suscribir) y la
 * interfaz decide cómo mostrarlos. Clave de almacenamiento: `novafisica_{email}`.
 *
 * Esquema persistido: { email, puntosXP, rachaDias, ultimaVisita, vidas, insignias, quizHistorial }
 *   (los registros antiguos con `xp` / `racha` se migran al leerlos).
 *
 * Racha diaria (al ingresar Y al ganar XP, por si la pestaña sigue abierta tras la medianoche):
 *   mismo día → intacta · día siguiente → +1 · más de un día sin ingresar → 1.
 *
 * Eventos emitidos (oyente recibe `(evento, estadoActual)`):
 *   sesion {nueva} · xp {cantidad, motivo} · nivel {nivel} · insignia {id} · vida-perdida {restantes}
 *   vidas-agotadas · racha-incrementada {rachaDias} · racha-reiniciada · vidas-recargadas
 *   datos-corruptos · guardado-fallido · sincronizado
 */
class GestorProgreso {
    static PREFIJO_CLAVE = 'novafisica_';
    static VIDAS_MAX = 3;
    /** Clave de sesión activa: el doble guion bajo no puede colisionar con `novafisica_{email}` (un email siempre lleva '@'). */
    static CLAVE_SESION = 'novafisica__sesion';
    static DURACION_SESION_MS = 60 * 60 * 1000; // 1 hora
    static INSIGNIA_INICIAL = 'explorador';
    static REGLAS_INSIGNIAS = Object.freeze([
        Object.freeze({ id: 'francotirador', xpMinimo: 500 })
    ]);
    static REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    static REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
    static XP_POR_NIVEL = 250;

    /**
     * @param {{almacenamiento?: Storage, reloj?: () => Date}} [opciones] inyectables para pruebas
     */
    constructor({ almacenamiento = GestorProgreso.obtenerAlmacenamiento(), reloj = () => new Date() } = {}) {
        this._almacenamiento = almacenamiento;
        this._reloj = reloj;
        this._estado = null;
        this._clave = null;
        this._oyentes = new Set();
        this._avisoGuardadoFallido = false;
        this._vincularSincronizacionEntrePestanas();
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    /** Copia inmutable del estado: la UI nunca puede mutarlo directamente. */
    get estado() {
        if (!this._estado) return null;
        return Object.freeze({
            ...this._estado,
            insignias: Object.freeze([...this._estado.insignias]),
            quizHistorial: Object.freeze([...this._estado.quizHistorial])
        });
    }

    /**
     * Nivel lineal: cada XP_POR_NIVEL puntos se sube uno (nivel 1 con 0 XP).
     * @returns {{nivel: number, xpEnNivel: number, xpPorNivel: number, faltante: number, progreso: number}}
     */
    static nivel(puntosXP) {
        const porNivel = GestorProgreso.XP_POR_NIVEL;
        const xp = Math.max(0, Math.trunc(puntosXP) || 0);
        const xpEnNivel = xp % porNivel;
        return {
            nivel: Math.floor(xp / porNivel) + 1,
            xpEnNivel,
            xpPorNivel: porNivel,
            faltante: porNivel - xpEnNivel,
            progreso: xpEnNivel / porNivel
        };
    }

    get tieneVidas() {
        return !!this._estado && this._estado.vidas > 0;
    }

    static esEmailValido(valor) {
        return typeof valor === 'string' && GestorProgreso.REGEX_EMAIL.test(valor.trim());
    }

    /** @returns {() => void} función para cancelar la suscripción */
    suscribir(oyente) {
        this._oyentes.add(oyente);
        return () => this._oyentes.delete(oyente);
    }

    /**
     * Carga (o crea) el progreso del usuario y actualiza la racha diaria.
     * @returns {boolean} false si el correo no es válido
     */
    iniciarSesion(email, { renovarVentana = true } = {}) {
        const id = typeof email === 'string' ? email.trim() : '';
        if (!GestorProgreso.esEmailValido(id)) return false;

        this._clave = `${GestorProgreso.PREFIJO_CLAVE}${id}`;
        const hoy = this._hoyISO();
        const eventos = [];

        const lectura = this._leer(this._clave, id);
        let nueva = false;
        if (lectura.estado) {
            this._estado = lectura.estado;
            this._actualizarRachaDiaria(hoy, eventos);
        } else {
            if (lectura.corrupto) {
                this._respaldarCorrupto(lectura.crudo);
                eventos.push({ tipo: 'datos-corruptos' });
            }
            this._estado = GestorProgreso.crearEstadoInicial(id, hoy);
            nueva = true;
        }

        this.guardar();
        if (renovarVentana) this._guardarSesionActiva(id);
        this._emitirTodos([{ tipo: 'sesion', nueva }, ...eventos]);
        return true;
    }

    /**
     * Reanuda la sesión si el usuario ingresó hace menos de 1 hora (p. ej. recarga accidental).
     * No extiende la ventana: expira 1 h después del ingreso con correo.
     * @returns {boolean} true si había una sesión vigente y se restauró
     */
    restaurarSesion() {
        const sesion = this._leerSesionActiva();
        if (!sesion) return false;
        if (this.iniciarSesion(sesion.email, { renovarVentana: false })) return true;
        this.cerrarSesion();
        return false;
    }

    /** Olvida la sesión activa (el progreso del usuario se conserva). */
    cerrarSesion() {
        try {
            this._almacenamiento.removeItem(GestorProgreso.CLAVE_SESION);
        } catch (error) {
            // sin acceso a storage: nada que limpiar
        }
    }

    _guardarSesionActiva(email) {
        try {
            const expira = this._reloj().getTime() + GestorProgreso.DURACION_SESION_MS;
            this._almacenamiento.setItem(GestorProgreso.CLAVE_SESION, JSON.stringify({ email, expira }));
        } catch (error) {
            // sin persistencia de sesión: se pedirá el correo al recargar
        }
    }

    /** @returns {{email: string, expira: number}|null} null si no existe, está corrupta o expiró */
    _leerSesionActiva() {
        let sesion = null;
        try {
            const crudo = this._almacenamiento.getItem(GestorProgreso.CLAVE_SESION);
            sesion = crudo ? JSON.parse(crudo) : null;
        } catch (error) {
            sesion = null;
        }
        const valida = sesion && typeof sesion.email === 'string' && Number.isFinite(sesion.expira)
            && sesion.expira > this._reloj().getTime();
        if (!valida) {
            if (sesion) this.cerrarSesion(); // limpia sesión expirada o corrupta
            return null;
        }
        return sesion;
    }

    /**
     * Única vía para ganar experiencia (desafíos, laboratorio y Quiz XP).
     * @param {number} cantidad  puntos enteros > 0
     * @param {string} [motivo]  texto corto para el aviso ("Quiz XP", "Diana en tiro parabólico"…)
     * @returns {boolean} true si se sumó XP
     */
    sumarXP(cantidad, motivo = '') {
        const puntos = Math.trunc(cantidad);
        if (!this._estado || !Number.isFinite(puntos) || puntos <= 0) return false;

        const eventos = [];
        this._actualizarRachaDiaria(this._hoyISO(), eventos);   // jugar en un día nuevo también cuenta

        const nivelAntes = GestorProgreso.nivel(this._estado.puntosXP).nivel;
        this._estado.puntosXP += puntos;
        eventos.push({ tipo: 'xp', cantidad: puntos, motivo: String(motivo) });

        const nivelAhora = GestorProgreso.nivel(this._estado.puntosXP).nivel;
        if (nivelAhora > nivelAntes) eventos.push({ tipo: 'nivel', nivel: nivelAhora });

        GestorProgreso.REGLAS_INSIGNIAS.forEach(({ id, xpMinimo }) => {
            if (this._estado.puntosXP >= xpMinimo && !this._estado.insignias.includes(id)) {
                this._estado.insignias.push(id);
                eventos.push({ tipo: 'insignia', id });
            }
        });

        this.guardar();
        this._emitirTodos(eventos);
        return true;
    }

    /** Ids de preguntas del Quiz XP ya mostradas en el ciclo actual del banco. */
    get historialQuiz() {
        return this._estado ? [...this._estado.quizHistorial] : [];
    }

    /** Reemplaza el historial de rotación del quiz (lo calcula QuizXP; aquí solo se valida y persiste). */
    guardarHistorialQuiz(ids) {
        if (!this._estado || !Array.isArray(ids)) return false;
        this._estado.quizHistorial = [...new Set(ids.filter((id) => typeof id === 'string'))];
        return this.guardar();
    }

    /** @returns {boolean} true si se descontó una vida (false si ya no quedaban) */
    restarVida() {
        if (!this._estado || this._estado.vidas <= 0) return false;

        this._estado.vidas -= 1;
        const eventos = [{ tipo: 'vida-perdida', restantes: this._estado.vidas }];
        if (this._estado.vidas === 0) eventos.push({ tipo: 'vidas-agotadas' });

        this.guardar();
        this._emitirTodos(eventos);
        return true;
    }

    /**
     * Persiste el estado. Nunca lanza: si el almacenamiento falla (cuota, modo privado)
     * emite 'guardado-fallido' una sola vez y el juego sigue funcionando en memoria.
     * @returns {boolean}
     */
    guardar() {
        if (!this._estado || !this._clave) return false;
        try {
            this._almacenamiento.setItem(this._clave, JSON.stringify(this._estado));
            this._avisoGuardadoFallido = false;
            return true;
        } catch (error) {
            if (!this._avisoGuardadoFallido) {
                this._avisoGuardadoFallido = true;
                this._emitir({ tipo: 'guardado-fallido' });
            }
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Esquema y normalización
    // ------------------------------------------------------------------

    static crearEstadoInicial(email, hoy) {
        return {
            email,
            puntosXP: 0,
            rachaDias: 1,
            ultimaVisita: hoy,
            vidas: GestorProgreso.VIDAS_MAX,
            insignias: [GestorProgreso.INSIGNIA_INICIAL],
            quizHistorial: []
        };
    }

    /**
     * Valida y sanea un registro leído de disco (datos de versiones antiguas o manipulados).
     * @returns {object|null} null si no es un objeto utilizable
     */
    static normalizar(crudo, email) {
        if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;

        const entero = (valor, porDefecto, minimo = 0) =>
            Number.isFinite(valor) ? Math.max(minimo, Math.trunc(valor)) : porDefecto;

        const insignias = Array.isArray(crudo.insignias)
            ? [...new Set(crudo.insignias.filter((i) => typeof i === 'string'))]
            : [];
        if (!insignias.includes(GestorProgreso.INSIGNIA_INICIAL)) insignias.unshift(GestorProgreso.INSIGNIA_INICIAL);

        const fechaValida = typeof crudo.ultimaVisita === 'string' && GestorProgreso.REGEX_FECHA.test(crudo.ultimaVisita);
        const quizHistorial = Array.isArray(crudo.quizHistorial)
            ? [...new Set(crudo.quizHistorial.filter((id) => typeof id === 'string'))]
            : [];

        return {
            email,
            puntosXP: entero(crudo.puntosXP ?? crudo.xp, 0),          // migración: `xp` (esquema anterior)
            rachaDias: entero(crudo.rachaDias ?? crudo.racha, 1, 1),  // migración: `racha`
            ultimaVisita: fechaValida ? crudo.ultimaVisita : null,
            vidas: Math.min(GestorProgreso.VIDAS_MAX, entero(crudo.vidas, GestorProgreso.VIDAS_MAX)),
            insignias,
            quizHistorial
        };
    }

    // ------------------------------------------------------------------
    // Persistencia (privado)
    // ------------------------------------------------------------------

    /** localStorage si está disponible; si no (modo privado, bloqueado), un sustituto en memoria. */
    static obtenerAlmacenamiento() {
        try {
            const almacenamiento = globalThis.localStorage;
            const sonda = '__novafisica_sonda__';
            almacenamiento.setItem(sonda, '1');
            almacenamiento.removeItem(sonda);
            return almacenamiento;
        } catch (error) {
            const memoria = new Map();
            return {
                getItem: (clave) => (memoria.has(clave) ? memoria.get(clave) : null),
                setItem: (clave, valor) => { memoria.set(clave, String(valor)); },
                removeItem: (clave) => { memoria.delete(clave); }
            };
        }
    }

    /** @returns {{estado: object|null, corrupto: boolean, crudo?: string}} */
    _leer(clave, email) {
        let crudo;
        try {
            crudo = this._almacenamiento.getItem(clave);
        } catch (error) {
            return { estado: null, corrupto: false };
        }
        if (crudo === null) return { estado: null, corrupto: false };

        try {
            const estado = GestorProgreso.normalizar(JSON.parse(crudo), email);
            if (estado) return { estado, corrupto: false };
        } catch (error) {
            // JSON inválido: se trata como dato corrupto
        }
        return { estado: null, corrupto: true, crudo };
    }

    /** Conserva el dato dañado bajo `<clave>_corrupto` para poder recuperarlo manualmente. */
    _respaldarCorrupto(crudo) {
        try {
            this._almacenamiento.setItem(`${this._clave}_corrupto`, crudo);
        } catch (error) {
            // sin espacio: se descarta el respaldo
        }
    }

    /** Si otra pestaña modifica la misma clave, se adopta su estado (evita pisar progreso). */
    _vincularSincronizacionEntrePestanas() {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        window.addEventListener('storage', (e) => {
            if (!this._clave || e.key !== this._clave || e.storageArea !== this._almacenamiento) return;
            const lectura = this._leer(this._clave, this._estado ? this._estado.email : '');
            if (lectura.estado) {
                this._estado = lectura.estado;
                this._emitir({ tipo: 'sincronizado' });
            }
        });
    }

    // ------------------------------------------------------------------
    // Racha diaria (privado)
    // ------------------------------------------------------------------

    /** Fecha local en formato YYYY-MM-DD. */
    _hoyISO() {
        const d = this._reloj();
        const dos = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    }

    static _diasEntre(desdeISO, hastaISO) {
        const aUTC = (iso) => {
            const [a, m, d] = iso.split('-').map(Number);
            return Date.UTC(a, m - 1, d);
        };
        return Math.round((aUTC(hastaISO) - aUTC(desdeISO)) / 86400000);
    }

    /** Mismo día: nada · día siguiente: +1 · hueco: reinicio. Un día nuevo recarga las vidas. */
    _actualizarRachaDiaria(hoy, eventos) {
        const e = this._estado;
        const dias = e.ultimaVisita ? GestorProgreso._diasEntre(e.ultimaVisita, hoy) : null;
        if (dias !== null && dias <= 0) return; // mismo día (o reloj retrocedido)

        if (dias === 1) {
            e.rachaDias += 1;
            eventos.push({ tipo: 'racha-incrementada', rachaDias: e.rachaDias });
        } else {
            if (e.rachaDias > 1) eventos.push({ tipo: 'racha-reiniciada' });
            e.rachaDias = 1;
        }
        e.ultimaVisita = hoy;

        if (e.vidas < GestorProgreso.VIDAS_MAX) {
            e.vidas = GestorProgreso.VIDAS_MAX;
            eventos.push({ tipo: 'vidas-recargadas' });
        }
    }

    // ------------------------------------------------------------------
    // Eventos (privado)
    // ------------------------------------------------------------------

    _emitirTodos(eventos) {
        eventos.forEach((evento) => this._emitir(evento));
    }

    _emitir(evento) {
        const estado = this.estado;
        this._oyentes.forEach((oyente) => {
            try {
                oyente(evento, estado);
            } catch (error) {
                console.error('[GestorProgreso] error en oyente:', error);
            }
        });
    }
}
