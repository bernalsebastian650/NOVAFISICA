/**
 * NOVAFÍSICA - Laboratorio: Tiro Parabólico (#interactivo, pestaña 1).
 *
 * Parámetros (sliders): v0 [m/s], angulo [°], g [m/s²]. Preajustes de gravedad por astro.
 * La posición se evalúa con la solución analítica (Cinematica.estado) en cada paso fijo:
 * no hay error acumulado de integración, por lo que la trayectoria real coincide con la prevista.
 *
 * Fases: LISTO → VUELO → ATERRIZADO. Cambiar un parámetro en vuelo cancela el disparo.
 *
 * Diana: un objetivo sobre el suelo a una distancia alcanzable con la gravedad actual.
 * Si el proyectil aterriza dentro de ella → +20 XP (una vez por diana). Tras un acierto la diana
 * se reubica lejos de la anterior en el siguiente lanzamiento: repetir el mismo tiro no suma.
 */
class SimuladorParabolico extends SimuladorBase {
    static FASE = Object.freeze({ LISTO: 'listo', VUELO: 'vuelo', ATERRIZADO: 'aterrizado' });
    static MARGEN = Object.freeze({ izq: 52, der: 20, sup: 20, inf: 34 });
    static ANCHOS_MUNDO = [5, 10, 20, 50, 100, 200, 500, 1000];   // m: escalas "redondas" de la cuadrícula
    static DURACION_VUELO_MAX_S = 3.5;   // vuelos más largos se reproducen acelerados (se indica ×N)
    static PX_POR_MS = 2.4;              // escala de los vectores velocidad (px por m/s)
    static SEGMENTOS_CURVA = 90;
    static XP_DIANA = 20;
    static V0_MAX = 30;                  // = max del slider de v0 (para que la diana siempre sea alcanzable)

    constructor(opciones) {
        super(opciones);
        this.fase = SimuladorParabolico.FASE.LISTO;
        this.t = 0;
        this.escala = 1;      // px por metro
        this.anchoMundo = 10; // m
        this.diana = { x: 0, radio: 1 };   // m (centro y semiancho)
        this.dianaLograda = false;
    }

    /** La diana se coloca cuando ya se leyeron los sliders (depende de la gravedad actual). */
    iniciar() {
        super.iniciar();
        this._colocarDiana();
        this._recalcularEscala();
    }

    // ------------------------------------------------------------------
    // Derivados de los parámetros
    // ------------------------------------------------------------------

    get theta() { return (this.params.angulo * Math.PI) / 180; }
    get tiempoVuelo() { return Cinematica.tiempoVuelo(this.params.v0, this.theta, this.params.g); }
    get alcance() { return Cinematica.alcance(this.params.v0, this.theta, this.params.g); }
    get alturaMaxima() { return Cinematica.alturaMaxima(this.params.v0, this.theta, this.params.g); }

    /** Factor de reproducción: el vuelo nunca dura más de DURACION_VUELO_MAX_S en pantalla. */
    get velocidadReproduccion() {
        return Math.max(1, this.tiempoVuelo / SimuladorParabolico.DURACION_VUELO_MAX_S);
    }

    // ------------------------------------------------------------------
    // Ganchos
    // ------------------------------------------------------------------

    alCambiarParametro(nombre) {
        this.fase = SimuladorParabolico.FASE.LISTO;
        this.t = 0;
        // Una diana inalcanzable con la nueva gravedad (o ya acertada) se reubica
        if (this.dianaLograda || (nombre === 'g' && this.diana.x > this._alcanceMaximo() * 0.9)) this._colocarDiana();
        this._recalcularEscala();
        this._sincronizarBotones();
    }

    alAccion(accion, boton) {
        const { FASE } = SimuladorParabolico;
        if (accion === 'lanzar') {
            if (this.dianaLograda) {
                this._colocarDiana();
                this._recalcularEscala();
            }
            this.t = 0;
            this.fase = FASE.VUELO;
        } else if (accion === 'reiniciar') {
            if (this.dianaLograda) {
                this._colocarDiana();
                this._recalcularEscala();
            }
            this.t = 0;
            this.fase = FASE.LISTO;
        } else if (accion === 'gravedad') {
            this.fijarParametro('g', boton.dataset.valor);
        }
        this._sincronizarBotones();
    }

    alRedimensionar() {
        this._recalcularEscala();
        this._sincronizarBotones();
    }

    actualizar(dt) {
        const { FASE } = SimuladorParabolico;
        if (this.fase !== FASE.VUELO) return;
        this.t += dt * this.velocidadReproduccion;
        if (this.t >= this.tiempoVuelo) {
            this.t = this.tiempoVuelo;
            this.fase = FASE.ATERRIZADO;
            this._evaluarDiana();
            this._sincronizarBotones();
        }
    }

    // ------------------------------------------------------------------
    // Diana (recompensa)
    // ------------------------------------------------------------------

    _alcanceMaximo() {
        return (SimuladorParabolico.V0_MAX ** 2) / (this.params.g || 9.8);
    }

    /** Distancia aleatoria alcanzable; si hubo una diana previa, la nueva queda claramente lejos. */
    _colocarDiana() {
        const maximo = Math.min(this._alcanceMaximo(), 400);
        const anterior = this.diana.x;
        let x;
        let intentos = 0;
        do {
            x = maximo * (0.25 + Math.random() * 0.6);
            intentos++;
        } while (anterior > 0 && Math.abs(x - anterior) < maximo * 0.15 && intentos < 20);
        this.diana.x = x;
        this.diana.radio = Math.max(1, x * 0.05);
        this.dianaLograda = false;
    }

    _evaluarDiana() {
        if (this.dianaLograda || Math.abs(this.alcance - this.diana.x) > this.diana.radio) return;
        this.dianaLograda = true;
        this.lograr(SimuladorParabolico.XP_DIANA, '¡Diana en el tiro parabólico!');
    }

    // ------------------------------------------------------------------
    // Escala del mundo
    // ------------------------------------------------------------------

    _areaGrafica() {
        const { MARGEN } = SimuladorParabolico;
        const p = this.p;
        return {
            x0: MARGEN.izq,
            y0: p.height - MARGEN.inf,      // suelo (y = 0 m)
            ancho: p.width - MARGEN.izq - MARGEN.der,
            alto: p.height - MARGEN.sup - MARGEN.inf
        };
    }

    /** Elige el menor ancho "redondo" en el que caben alcance y altura (con holgura). */
    _recalcularEscala() {
        if (!this.p) return;
        const area = this._areaGrafica();
        const relacion = area.alto / area.ancho;
        const R = Math.max(this.alcance, this.diana.x + this.diana.radio) * 1.08;   // la diana siempre a la vista
        const H = this.alturaMaxima * 1.15;
        const { ANCHOS_MUNDO } = SimuladorParabolico;
        this.anchoMundo = ANCHOS_MUNDO.find((w) => w >= R && w * relacion >= H) ?? ANCHOS_MUNDO[ANCHOS_MUNDO.length - 1];
        this.escala = area.ancho / this.anchoMundo;
    }

    _aPantalla(x, y, area) {
        return { x: area.x0 + x * this.escala, y: area.y0 - y * this.escala };
    }

    _sincronizarBotones() {
        const lanzar = this.boton('lanzar');
        if (!lanzar) return;
        const enVuelo = this.fase === SimuladorParabolico.FASE.VUELO;
        lanzar.disabled = enVuelo;
        lanzar.textContent = this.fase === SimuladorParabolico.FASE.ATERRIZADO ? 'Lanzar de nuevo' : 'Lanzar';

        const g = this.params.g;
        this.controles.querySelectorAll('[data-accion="gravedad"]').forEach((b) => {
            b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.valor) - g) < 0.05));
        });
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    dibujar(p) {
        const { FASE } = SimuladorParabolico;
        const area = this._areaGrafica();
        p.background(this.c.fondo);

        this._dibujarCuadricula(p, area);
        this._dibujarDiana(p, area);
        this._dibujarCurva(p, area, this.tiempoVuelo, this.alfa('tenue', 110), 2, true);
        if (this.fase !== FASE.LISTO) this._dibujarCurva(p, area, this.t, this.c.cian, 3, false);
        this._dibujarCanon(p, area);
        this._dibujarMarcas(p, area);
        this._dibujarProyectil(p, area);
        this._dibujarHud(p);
    }

    _dibujarCuadricula(p, area) {
        const paso = this.anchoMundo / 10;
        const decimales = paso < 1 ? 1 : 0;
        const saltoEtiqueta = paso * this.escala < 36 ? 2 : 1;   // en móviles se rotula una línea de cada dos
        p.textSize(11);
        p.strokeWeight(1);

        for (let i = 0; i <= 10; i++) {
            const x = area.x0 + i * paso * this.escala;
            p.stroke(this.alfa('texto', 18));
            p.line(x, area.y0, x, area.y0 - area.alto);
            if (i % saltoEtiqueta) continue;
            p.noStroke();
            p.fill(this.c.tenue);
            p.textAlign(p.CENTER, p.TOP);
            p.text(SimuladorBase.formato(i * paso, decimales), x, area.y0 + 8);
        }
        for (let y = paso; y * this.escala <= area.alto; y += paso) {
            const py = area.y0 - y * this.escala;
            p.stroke(this.alfa('texto', 18));
            p.line(area.x0, py, area.x0 + area.ancho, py);
            p.noStroke();
            p.fill(this.c.tenue);
            p.textAlign(p.RIGHT, p.CENTER);
            p.text(SimuladorBase.formato(y, decimales), area.x0 - 8, py);
        }

        // Suelo y unidades
        p.stroke(this.alfa('tenue', 160));
        p.strokeWeight(2);
        p.line(area.x0, area.y0, area.x0 + area.ancho, area.y0);
        p.noStroke();
        p.fill(this.c.tenue);
        p.textAlign(p.RIGHT, p.TOP);
        p.text('x (m)', p.width - 4, area.y0 + 20);
        p.textAlign(p.LEFT, p.TOP);
        p.text('y (m)', 4, 4);
    }

    /** Polilínea de la trayectoria analítica entre 0 y tFin (prevista o recorrida). */
    _dibujarCurva(p, area, tFin, color, grosor, discontinua) {
        if (tFin <= 0) return;
        const { v0, g } = this.params;
        const theta = this.theta;
        const n = SimuladorParabolico.SEGMENTOS_CURVA;

        p.noFill();
        p.stroke(color);
        p.strokeWeight(grosor);
        if (discontinua) p.drawingContext.setLineDash([6, 6]);
        p.beginShape();
        for (let i = 0; i <= n; i++) {
            const e = Cinematica.estado(v0, theta, g, (tFin * i) / n);
            p.vertex(area.x0 + e.x * this.escala, area.y0 - Math.max(0, e.y) * this.escala);
        }
        p.endShape();
        if (discontinua) p.drawingContext.setLineDash([]);
    }

    _dibujarDiana(p, area) {
        const x1 = area.x0 + (this.diana.x - this.diana.radio) * this.escala;
        const ancho = Math.max(6, this.diana.radio * 2 * this.escala);
        const color = this.dianaLograda ? 'teal' : 'violeta';
        p.noStroke();
        p.fill(this.alfa(color, 70));
        p.rect(x1, area.y0 - 6, ancho, 6, 2);
        p.fill(this.c[color]);
        p.rect(x1 + ancho / 2 - 1, area.y0 - 30, 2, 24);                 // mástil
        p.triangle(x1 + ancho / 2 + 1, area.y0 - 30, x1 + ancho / 2 + 15, area.y0 - 25, x1 + ancho / 2 + 1, area.y0 - 20);
        p.textSize(11);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text(this.dianaLograda ? `¡Diana! +${SimuladorParabolico.XP_DIANA} XP` : `Diana: ${SimuladorBase.formato(this.diana.x)} m`, x1 + ancho / 2, area.y0 - 34);
    }

    _dibujarCanon(p, area) {
        const theta = this.theta;
        p.push();
        p.translate(area.x0, area.y0);

        // Arco del ángulo con su etiqueta
        p.noFill();
        p.stroke(this.alfa('violeta', 200));
        p.strokeWeight(1.5);
        p.arc(0, 0, 70, 70, -theta, 0);
        p.noStroke();
        p.fill(this.c.violeta);
        p.textSize(12);
        p.textAlign(p.LEFT, p.CENTER);
        p.text(`θ = ${this.params.angulo}°`, 44 * Math.cos(theta / 2), -44 * Math.sin(theta / 2));

        // Tubo + base
        p.rotate(-theta);
        p.fill(this.alfa('cian', 220));
        p.rect(0, -6, 30, 12, 4);
        p.rotate(theta);
        p.fill(this.c.cian);
        p.arc(0, 0, 30, 30, Math.PI, Math.PI * 2);
        p.pop();
    }

    /** Altura máxima siempre visible; alcance cuando el proyectil aterriza. */
    _dibujarMarcas(p, area) {
        const { FASE } = SimuladorParabolico;
        const tCima = this.tiempoVuelo / 2;
        const cima = Cinematica.estado(this.params.v0, this.theta, this.params.g, tCima);
        const pc = this._aPantalla(cima.x, cima.y, area);

        p.stroke(this.alfa('violeta', 120));
        p.strokeWeight(1);
        this.lineaDiscontinua(p, pc.x, pc.y, pc.x, area.y0, 4, 4);
        p.noStroke();
        p.fill(this.c.violeta);
        p.circle(pc.x, pc.y, 6);
        p.textSize(12);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text(`H = ${SimuladorBase.formato(this.alturaMaxima)} m`, pc.x, pc.y - 8);

        if (this.fase === FASE.ATERRIZADO) {
            const px = area.x0 + this.alcance * this.escala;
            p.fill(this.c.teal);
            p.circle(px, area.y0, 8);
            p.textAlign(p.RIGHT, p.BOTTOM);   // a la izquierda del impacto: no choca con la bandera de la diana
            p.text(`R = ${SimuladorBase.formato(this.alcance)} m`, px - 10, area.y0 - 6);
        }
    }

    _dibujarProyectil(p, area) {
        const { PX_POR_MS } = SimuladorParabolico;
        const e = Cinematica.estado(this.params.v0, this.theta, this.params.g, this.t);
        const pos = this._aPantalla(e.x, Math.max(0, e.y), area);

        // Vectores: componentes vx (cian), vy (violeta) y resultante v (blanco)
        const vx = e.vx * PX_POR_MS;
        const vy = -e.vy * PX_POR_MS;
        this.flecha(p, pos.x, pos.y, pos.x + vx, pos.y, this.alfa('cian', 230), 2);
        this.flecha(p, pos.x, pos.y, pos.x, pos.y + vy, this.alfa('violeta', 230), 2);
        this.flecha(p, pos.x, pos.y, pos.x + vx, pos.y + vy, this.c.texto, 2.5);

        p.noStroke();
        p.fill(this.c.texto);
        p.circle(pos.x, pos.y, 14);
        p.fill(this.c.cian);
        p.circle(pos.x, pos.y, 6);
    }

    _dibujarHud(p) {
        const f = SimuladorBase.formato;
        const e = Cinematica.estado(this.params.v0, this.theta, this.params.g, this.t);
        const repro = this.velocidadReproduccion;
        const lineas = [
            `t = ${f(this.t, 2)} s${repro > 1.05 ? `  (×${f(repro, 1)})` : ''}`,
            `x = ${f(e.x)} m   y = ${f(Math.max(0, e.y))} m`,
            `vx = ${f(e.vx)} m/s   vy = ${f(e.vy)} m/s`
        ];
        const teoria = [
            `Tiempo de vuelo: ${f(this.tiempoVuelo, 2)} s`,
            `Alcance R: ${f(this.alcance)} m`,
            `Altura máx. H: ${f(this.alturaMaxima)} m`
        ];
        const { MARGEN } = SimuladorParabolico;
        this.hud(p, MARGEN.izq + 8, MARGEN.sup, lineas);
        if (p.width >= 560) this.hud(p, p.width - MARGEN.der - 4, MARGEN.sup, teoria, 'derecha');
    }
}
