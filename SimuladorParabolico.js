/**
 * NOVAFÍSICA - Simulador de tiro parabólico (p5.js en modo instancia).
 *
 * Responsabilidades:
 *   - Renderizado y entrada de usuario. La física vive en Cinematica.js.
 *   - No toca el progreso ni el DOM externo: informa del resultado con `alResolver('acierto'|'fallo')`.
 *
 * Máquina de estados (cada disparo se resuelve UNA sola vez):
 *   LISTO → APUNTANDO → VUELO → RESUELTO → (pausa) → LISTO
 *
 * Entrada: Pointer Events con captura sobre el <canvas> (unifica mouse y táctil).
 * Nada escucha a `window`, de modo que clics en la interfaz o el scroll de la página
 * nunca disparan el simulador (`touch-action: none` en CSS evita el scroll solo sobre el canvas).
 */
class SimuladorParabolico {
    static ALTO = 400;
    static ANCHO_MIN = 280;
    static ANCHO_MAX = 800;
    static ALTO_SUELO = 20;
    static CANON = Object.freeze({ x: 50, radio: 30 });
    static OBJETIVO = Object.freeze({ ancho: 45, alto: 40 });
    static RADIO_PROYECTIL = 8;
    static ARRASTRE_MIN = 12;           // px: por debajo se cancela el disparo
    static PASO_MAX_S = 1 / 120;        // subpasos de física: evita que un proyectil rápido atraviese el objetivo
    static DT_MAX_MS = 50;              // tope por frame (pestaña en segundo plano, pausa de bucle)
    static PAUSA_RESULTADO_MS = 1200;
    static PUNTOS_GUIA = 12;
    static PASO_GUIA_S = 0.06;

    static FASE = Object.freeze({
        LISTO: 'listo',
        APUNTANDO: 'apuntando',
        VUELO: 'vuelo',
        RESUELTO: 'resuelto'
    });

    /**
     * @param {{contenedor: HTMLElement, colores: Record<string,string>, alResolver: (r: 'acierto'|'fallo') => void}} opciones
     *   colores: fondo, estructura, objetivo, canon, guia, mensaje (cadenas CSS)
     */
    constructor({ contenedor, colores, alResolver }) {
        this._contenedor = contenedor;
        this._colores = colores;
        this._alResolver = alResolver;

        this._fase = SimuladorParabolico.FASE.LISTO;
        this._bloqueo = null;                 // {mensaje} mientras no haya vidas
        this._destruido = false;

        this._ancla = null;
        this._puntero = null;
        this._punteroId = null;

        this._lanzamiento = null;
        this._t = 0;
        this._proyectil = { x: 0, y: 0 };     // objeto único reutilizado: sin asignaciones por frame
        this._objetivo = { x: 0, y: 0, ...SimuladorParabolico.OBJETIVO };
        this._mensajeResultado = '';
        this._temporizadorReinicio = null;

        this._p = null;
        this._elementoCanvas = null;
        this._manejadores = null;
        this._observador = null;

        this._p5 = new p5((p) => this._definirSketch(p));
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    /** Bloquea/desbloquea los disparos (p. ej. sin vidas). Cancela un apuntado en curso. */
    establecerBloqueo(activo, mensaje = '') {
        this._bloqueo = activo ? { mensaje } : null;
        if (activo && this._fase === SimuladorParabolico.FASE.APUNTANDO) this._cancelarApuntado();
    }

    /** Libera listeners, temporizadores, observador y la instancia de p5. */
    destruir() {
        this._destruido = true;
        clearTimeout(this._temporizadorReinicio);
        if (this._observador) this._observador.disconnect();
        if (this._elementoCanvas && this._manejadores) {
            Object.entries(this._manejadores).forEach(([tipo, fn]) => this._elementoCanvas.removeEventListener(tipo, fn));
        }
        this._p5.remove();
    }

    // ------------------------------------------------------------------
    // Ciclo de vida de p5
    // ------------------------------------------------------------------

    _definirSketch(p) {
        p.setup = () => {
            this._p = p;
            const lienzo = p.createCanvas(this._anchoDisponible(), SimuladorParabolico.ALTO);
            lienzo.parent(this._contenedor);

            this._colorP5 = Object.fromEntries(
                Object.entries(this._colores).map(([clave, valor]) => [clave, p.color(valor)])
            );

            this._vincularEventos(lienzo.elt);
            this._observarVisibilidad(p);
            this._prepararRonda();
        };

        p.draw = () => {
            if (this._fase === SimuladorParabolico.FASE.VUELO) this._avanzar(p.deltaTime);
            this._dibujar(p);
        };

        p.windowResized = () => this._redimensionar();
    }

    /** Pausa el bucle de dibujo cuando el canvas no está en pantalla (ahorra CPU/batería). */
    _observarVisibilidad(p) {
        if (typeof IntersectionObserver === 'undefined') return;
        this._observador = new IntersectionObserver(([entrada]) => {
            if (entrada.isIntersecting) p.loop(); else p.noLoop();
        });
        this._observador.observe(this._contenedor);
    }

    _anchoDisponible() {
        const { ANCHO_MIN, ANCHO_MAX } = SimuladorParabolico;
        return Math.max(ANCHO_MIN, Math.min(this._contenedor.clientWidth, ANCHO_MAX));
    }

    _redimensionar() {
        const p = this._p;
        if (!p) return;
        const ancho = this._anchoDisponible();
        if (ancho === p.width) return;

        if (this._fase === SimuladorParabolico.FASE.APUNTANDO) this._cancelarApuntado();
        const factor = ancho / p.width;
        p.resizeCanvas(ancho, SimuladorParabolico.ALTO);

        const o = this._objetivo;
        o.x = Math.min(Math.max(o.x * factor, 0), ancho - o.ancho);
    }

    // ------------------------------------------------------------------
    // Entrada (Pointer Events sobre el canvas)
    // ------------------------------------------------------------------

    _vincularEventos(elemento) {
        this._elementoCanvas = elemento;
        this._manejadores = {
            pointerdown: (e) => this._alPresionar(e),
            pointermove: (e) => this._alMover(e),
            pointerup: (e) => this._alSoltar(e),
            pointercancel: (e) => this._alCancelar(e)
        };
        Object.entries(this._manejadores).forEach(([tipo, fn]) => elemento.addEventListener(tipo, fn));
    }

    /** Coordenadas del puntero en espacio de canvas, acotadas a sus límites. */
    _coordenadas(e) {
        const rect = this._elementoCanvas.getBoundingClientRect();
        const p = this._p;
        const x = (e.clientX - rect.left) * (p.width / rect.width);
        const y = (e.clientY - rect.top) * (p.height / rect.height);
        return {
            x: Math.min(Math.max(x, 0), p.width),
            y: Math.min(Math.max(y, 0), p.height)
        };
    }

    _alPresionar(e) {
        const { FASE } = SimuladorParabolico;
        if (this._fase !== FASE.LISTO || this._bloqueo) return;
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;

        e.preventDefault();
        this._elementoCanvas.setPointerCapture(e.pointerId); // el arrastre sigue aunque el puntero salga del canvas
        this._punteroId = e.pointerId;
        this._ancla = this._coordenadas(e);
        this._puntero = { ...this._ancla };
        this._fase = FASE.APUNTANDO;
    }

    _alMover(e) {
        if (e.pointerId !== this._punteroId || this._fase !== SimuladorParabolico.FASE.APUNTANDO) return;
        this._puntero = this._coordenadas(e);
    }

    _alSoltar(e) {
        if (e.pointerId !== this._punteroId) return;
        this._liberarPuntero();
        if (this._fase !== SimuladorParabolico.FASE.APUNTANDO) return;

        this._puntero = this._coordenadas(e);
        const lanzamiento = this._calcularLanzamiento();
        if (lanzamiento) this._disparar(lanzamiento); else this._cancelarApuntado();
    }

    _alCancelar(e) {
        if (e.pointerId !== this._punteroId) return;
        this._cancelarApuntado();
    }

    _liberarPuntero() {
        try {
            this._elementoCanvas.releasePointerCapture(this._punteroId);
        } catch (error) {
            // el puntero ya no estaba capturado
        }
        this._punteroId = null;
    }

    _cancelarApuntado() {
        if (this._punteroId !== null) this._liberarPuntero();
        this._ancla = null;
        this._puntero = null;
        this._fase = SimuladorParabolico.FASE.LISTO;
    }

    // ------------------------------------------------------------------
    // Física y estado de la ronda
    // ------------------------------------------------------------------

    _sueloY() {
        return this._p.height - SimuladorParabolico.ALTO_SUELO;
    }

    /** Punto de lanzamiento: el proyectil reposa sobre el suelo, en la boca del cañón. */
    _origen() {
        return {
            x: SimuladorParabolico.CANON.x,
            y: this._sueloY() - SimuladorParabolico.RADIO_PROYECTIL
        };
    }

    /** @returns {{x0,y0,v0,theta}|null} null si el arrastre es demasiado corto */
    _calcularLanzamiento() {
        const dx = this._ancla.x - this._puntero.x;
        const dy = this._ancla.y - this._puntero.y;
        if (Math.hypot(dx, dy) < SimuladorParabolico.ARRASTRE_MIN) return null;

        const { v0, theta } = Cinematica.lanzamientoDesdeArrastre(dx, dy);
        const origen = this._origen();
        return { x0: origen.x, y0: origen.y, v0, theta };
    }

    _disparar(lanzamiento) {
        this._lanzamiento = lanzamiento;
        this._t = 0;
        this._proyectil.x = lanzamiento.x0;
        this._proyectil.y = lanzamiento.y0;
        this._ancla = null;
        this._puntero = null;
        this._fase = SimuladorParabolico.FASE.VUELO;
    }

    /** Integra la trayectoria analítica en subpasos fijos; se detiene en la primera resolución. */
    _avanzar(dtMs) {
        const { FASE, DT_MAX_MS, PASO_MAX_S } = SimuladorParabolico;
        let restante = Math.min(dtMs, DT_MAX_MS) / 1000;

        while (restante > 0 && this._fase === FASE.VUELO) {
            const paso = Math.min(restante, PASO_MAX_S);
            this._t += paso;
            restante -= paso;

            const pos = Cinematica.posicion(this._lanzamiento, this._t);
            this._proyectil.x = pos.x;
            this._proyectil.y = pos.y;

            // Orden de prioridad: el objetivo se evalúa antes que el suelo (el objetivo apoya sobre él)
            if (this._colisionaObjetivo(pos)) this._resolver('acierto');
            else if (this._fueraDeLimites(pos)) this._resolver('fallo');
        }
    }

    /** Colisión círculo (proyectil) contra rectángulo (objetivo). */
    _colisionaObjetivo({ x, y }) {
        const o = this._objetivo;
        const r = SimuladorParabolico.RADIO_PROYECTIL;
        const cx = Math.min(Math.max(x, o.x), o.x + o.ancho);
        const cy = Math.min(Math.max(y, o.y), o.y + o.alto);
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }

    /** Sale por los lados o toca el suelo en descenso. */
    _fueraDeLimites({ x, y }) {
        const r = SimuladorParabolico.RADIO_PROYECTIL;
        const bajando = Cinematica.velocidadVertical(this._lanzamiento, this._t) < 0;
        return x < -r || x > this._p.width + r || (bajando && y >= this._sueloY() - r);
    }

    /**
     * Cierra el disparo. El guardado de fase impide resoluciones duplicadas: un mismo disparo
     * nunca puede restar dos vidas ni sumar XP dos veces.
     */
    _resolver(resultado) {
        const { FASE, PAUSA_RESULTADO_MS } = SimuladorParabolico;
        if (this._fase !== FASE.VUELO) return;

        this._fase = FASE.RESUELTO;
        this._lanzamiento = null;
        this._mensajeResultado = resultado === 'acierto' ? '¡Impacto Perfecto!' : 'Fallaste. Intenta de nuevo.';

        // Fuera del frame de dibujo: la mutación del estado/DOM externo no ocurre dentro de draw()
        queueMicrotask(() => {
            if (!this._destruido && this._alResolver) this._alResolver(resultado);
        });

        this._temporizadorReinicio = setTimeout(() => {
            this._temporizadorReinicio = null;
            if (!this._destruido) this._prepararRonda();
        }, PAUSA_RESULTADO_MS);
    }

    _prepararRonda() {
        const p = this._p;
        const origen = this._origen();
        const o = this._objetivo;

        this._proyectil.x = origen.x;
        this._proyectil.y = origen.y;
        o.x = p.random(p.width / 2 + 50, p.width - 60);
        o.y = this._sueloY() - o.alto;

        this._lanzamiento = null;
        this._t = 0;
        this._ancla = null;
        this._puntero = null;
        this._fase = SimuladorParabolico.FASE.LISTO;
    }

    // ------------------------------------------------------------------
    // Render (solo dibuja dentro del canvas; no toca el DOM)
    // ------------------------------------------------------------------

    _mensaje() {
        const { FASE } = SimuladorParabolico;
        switch (this._fase) {
            case FASE.APUNTANDO: return 'Suelta para lanzar.';
            case FASE.VUELO: return '¡Proyectil en vuelo!';
            case FASE.RESUELTO: return this._mensajeResultado;
            default: return this._bloqueo ? this._bloqueo.mensaje : 'Arrastra y suelta para disparar.';
        }
    }

    _dibujar(p) {
        const c = this._colorP5;
        const { CANON, RADIO_PROYECTIL, ALTO_SUELO, FASE } = SimuladorParabolico;
        const sueloY = this._sueloY();
        const o = this._objetivo;

        p.background(c.fondo);
        p.noStroke();

        // Suelo
        p.fill(c.estructura);
        p.rect(0, sueloY, p.width, ALTO_SUELO);

        // Objetivo
        p.fill(c.objetivo);
        p.rect(o.x, o.y, o.ancho, o.alto, 4);

        // Cañón base
        p.fill(c.canon);
        p.arc(CANON.x, sueloY, CANON.radio * 2, CANON.radio * 2, p.PI, p.TWO_PI);

        if (this._fase === FASE.APUNTANDO) this._dibujarApuntado(p, c, sueloY);

        // Proyectil
        p.fill(c.estructura);
        p.noStroke();
        p.circle(this._proyectil.x, this._proyectil.y, RADIO_PROYECTIL * 2);

        // Mensaje de estado
        p.fill(c.mensaje);
        p.textFont('Inter');
        p.textSize(15);
        p.textAlign(p.CENTER);
        p.text(this._mensaje(), p.width / 2, 35);
    }

    /** Línea de tensión y guía punteada calculada con la misma cinemática que el disparo real. */
    _dibujarApuntado(p, c, sueloY) {
        p.stroke(c.guia);
        p.strokeWeight(3);
        p.line(this._ancla.x, this._ancla.y, this._puntero.x, this._puntero.y);

        const lanzamiento = this._calcularLanzamiento();
        if (!lanzamiento) return;

        p.noStroke();
        p.fill(c.guia);
        for (let i = 1; i <= SimuladorParabolico.PUNTOS_GUIA; i++) {
            const pos = Cinematica.posicion(lanzamiento, i * SimuladorParabolico.PASO_GUIA_S);
            if (pos.y > sueloY) break;
            p.circle(pos.x, pos.y, 4);
        }
    }
}
