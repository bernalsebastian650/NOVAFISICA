/**
 * NOVAFÍSICA - Laboratorio: 2.ª Ley de Newton (#interactivo, pestaña 2).
 *
 * Bloque de masa m sobre una superficie horizontal con coeficiente de fricción μ,
 * empujado por una fuerza horizontal F ≥ 0.
 *
 *   N = m·g      f_máx = μ·N
 *   En reposo y F ≤ f_máx → la fricción estática equilibra F (a = 0).
 *   En otro caso          → f = μ·N opuesta al movimiento, a = (F − f) / m.
 *
 * Integración semi-implícita de Euler con paso fijo (SimuladorBase). Si la fricción frenaría
 * el bloque más allá del reposo dentro de un paso, se detiene exactamente en v = 0.
 * La gráfica v–t (pendiente = a) usa búferes preasignados: memoria constante.
 */
class SimuladorNewton extends SimuladorBase {
    static G = 9.8;
    static DURACION_S = 10;            // ventana de la gráfica; al llegar se pausa
    static MUESTRAS_POR_S = 30;
    static PX_POR_M = 40;              // escala de la escena (el suelo se desplaza bajo el bloque)
    static PX_POR_N = 2.2;
    static FLECHA_MAX = 150;
    static MARGEN = 16;

    constructor(opciones) {
        super(opciones);
        const n = SimuladorNewton.DURACION_S * SimuladorNewton.MUESTRAS_POR_S + 1;
        this._muestrasT = new Float32Array(n);
        this._muestrasV = new Float32Array(n);
        this._reiniciarEstado();
    }

    _reiniciarEstado() {
        this.x = 0;
        this.v = 0;
        this.t = 0;
        this.corriendo = false;
        this._nMuestras = 1;           // la muestra 0 es (0, 0)
        this._muestrasT[0] = 0;
        this._muestrasV[0] = 0;
        this._vMaxGrafica = 1;
    }

    // ------------------------------------------------------------------
    // Física
    // ------------------------------------------------------------------

    /** Fuerzas instantáneas para el estado actual (también se usan para dibujar con la simulación en pausa). */
    fuerzas() {
        const { masa, fuerza, friccion } = this.params;
        const normal = masa * SimuladorNewton.G;
        const fMax = friccion * normal;
        const enReposo = this.v <= 0;
        const estatica = enReposo && fuerza <= fMax;
        const roce = estatica ? fuerza : fMax;
        const neta = fuerza - roce;
        return { normal, roce, neta, estatica, aceleracion: neta / masa };
    }

    actualizar(dt) {
        if (!this.corriendo) return;
        const { aceleracion } = this.fuerzas();
        this.v = Math.max(0, this.v + aceleracion * dt);   // la fricción no invierte el movimiento
        this.x += this.v * dt;
        this.t += dt;
        this._registrarMuestra();

        if (this.t >= SimuladorNewton.DURACION_S) {
            this.t = SimuladorNewton.DURACION_S;
            this.corriendo = false;
            this._sincronizarBotones();
        }
    }

    _registrarMuestra() {
        const { MUESTRAS_POR_S } = SimuladorNewton;
        const indice = Math.floor(this.t * MUESTRAS_POR_S);
        if (indice < this._nMuestras || indice >= this._muestrasT.length) return;
        this._muestrasT[indice] = this.t;
        this._muestrasV[indice] = this.v;
        this._nMuestras = indice + 1;
        if (this.v > this._vMaxGrafica) this._vMaxGrafica = SimuladorNewton._techoRedondo(this.v);
    }

    /** 1, 2, 5, 10, 20, 50… inmediatamente por encima de v (ejes con números legibles). */
    static _techoRedondo(v) {
        const base = 10 ** Math.floor(Math.log10(v));
        return [1, 2, 5, 10].map((m) => m * base).find((c) => c >= v);
    }

    // ------------------------------------------------------------------
    // Ganchos
    // ------------------------------------------------------------------

    iniciar() {
        super.iniciar();
        this._sincronizarBotones();
    }

    alAccion(accion) {
        if (accion === 'alternar') {
            if (this.t >= SimuladorNewton.DURACION_S) this._reiniciarEstado();
            this.corriendo = !this.corriendo;
        } else if (accion === 'reiniciar') {
            this._reiniciarEstado();
        }
        this._sincronizarBotones();
    }

    altoPara(ancho) {
        return Math.round(Math.min(480, Math.max(400, ancho * 0.6)));
    }

    _sincronizarBotones() {
        const alternar = this.boton('alternar');
        if (!alternar) return;
        alternar.textContent = this.corriendo ? 'Pausar' : (this.t > 0 && this.t < SimuladorNewton.DURACION_S ? 'Reanudar' : 'Iniciar');
        alternar.setAttribute('aria-pressed', String(this.corriendo));
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    dibujar(p) {
        p.background(this.c.fondo);
        const altoEscena = Math.round(p.height * 0.6);
        const fz = this.fuerzas();
        this._dibujarEscena(p, altoEscena, fz);
        this._dibujarGrafica(p, altoEscena);
    }

    _dibujarEscena(p, altoEscena, fz) {
        const { PX_POR_M, PX_POR_N, FLECHA_MAX, MARGEN } = SimuladorNewton;
        const f = SimuladorBase.formato;
        const sueloY = altoEscena - 30;
        const lado = 34 + this.params.masa * 2;
        const bx = Math.round(p.width * 0.38);   // el bloque queda fijo; el suelo se desplaza (cámara que lo sigue)

        // Suelo con marcas cada metro
        p.noStroke();
        p.fill(this.alfa('tenue', 30));
        p.rect(0, sueloY, p.width, altoEscena - sueloY);
        p.stroke(this.alfa('tenue', 140));
        p.strokeWeight(2);
        p.line(0, sueloY, p.width, sueloY);
        p.strokeWeight(1);
        p.textSize(10);
        const primerMetro = Math.floor(this.x - bx / PX_POR_M);
        for (let m = primerMetro; (m - this.x) * PX_POR_M + bx <= p.width; m++) {
            const px = bx + (m - this.x) * PX_POR_M;
            const mayor = m % 5 === 0;
            p.stroke(this.alfa('tenue', mayor ? 160 : 70));
            p.line(px, sueloY, px, sueloY + (mayor ? 12 : 6));
            if (mayor) {
                p.noStroke();
                p.fill(this.c.tenue);
                p.textAlign(p.CENTER, p.TOP);
                p.text(`${m} m`, px, sueloY + 14);
            }
        }

        // Bloque
        const by = sueloY - lado;
        p.noStroke();
        p.fill(this.alfa('violeta', 60));
        p.rect(bx - lado / 2, by, lado, lado, 6);
        p.stroke(this.c.violeta);
        p.strokeWeight(2);
        p.noFill();
        p.rect(bx - lado / 2, by, lado, lado, 6);
        p.noStroke();
        p.fill(this.c.texto);
        p.textSize(12);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(`${f(this.params.masa, 1)} kg`, bx, by + lado / 2);

        // Vectores de fuerza: F (cian), fricción (violeta), neta (teal, sobre el bloque)
        const largo = (n) => Math.sign(n) * Math.min(Math.abs(n) * PX_POR_N, FLECHA_MAX);   // conserva el sentido
        const cy = by + lado / 2;
        this.flecha(p, bx + lado / 2, cy, bx + lado / 2 + largo(this.params.fuerza), cy, this.c.cian, 3);
        this.flecha(p, bx - lado / 2, sueloY - 4, bx - lado / 2 - largo(fz.roce), sueloY - 4, this.c.violeta, 3);
        this.flecha(p, bx, by - 14, bx + largo(fz.neta), by - 14, this.c.teal, 3);

        p.noStroke();
        p.textSize(12);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.fill(this.c.cian);
        if (this.params.fuerza > 0) p.text(`F = ${f(this.params.fuerza, 0)} N`, bx + lado / 2 + 6, cy - 6);
        p.fill(this.c.violeta);
        p.textAlign(p.RIGHT, p.BOTTOM);
        if (fz.roce > 0) p.text(`f = ${f(fz.roce)} N`, bx - lado / 2 - 6, sueloY - 10);
        p.fill(this.c.teal);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text(`F neta = ${f(fz.neta)} N`, bx, by - 22);

        // HUD con la ley: a = F_neta / m
        const lineas = [
            `a = F neta / m = ${f(fz.neta)} / ${f(this.params.masa)} = ${f(fz.aceleracion, 2)} m/s²`,
            `v = ${f(this.v, 2)} m/s   x = ${f(this.x)} m   t = ${f(this.t, 1)} s`
        ];
        if (fz.estatica && this.params.fuerza > 0) lineas.push('En reposo: la fricción estática equilibra F');
        this.hud(p, MARGEN, MARGEN, lineas);
    }

    _dibujarGrafica(p, altoEscena) {
        const { DURACION_S, MARGEN } = SimuladorNewton;
        const f = SimuladorBase.formato;
        const area = { x0: MARGEN + 36, y0: p.height - MARGEN - 18, ancho: 0, alto: 0 };
        area.ancho = p.width - area.x0 - MARGEN;
        area.alto = area.y0 - altoEscena - 30;
        const vMax = this._vMaxGrafica;

        p.noStroke();
        p.fill(this.c.texto);
        p.textSize(12);
        p.textAlign(p.RIGHT, p.TOP);
        p.text(p.width >= 520 ? 'Velocidad vs. tiempo  (la pendiente es la aceleración)' : 'v–t  (pendiente = a)', p.width - MARGEN, altoEscena + 6);

        // Ejes y cuadrícula
        p.textSize(10);
        for (let i = 0; i <= DURACION_S; i += 2) {
            const x = area.x0 + (i / DURACION_S) * area.ancho;
            p.stroke(this.alfa('texto', 18));
            p.strokeWeight(1);
            p.line(x, area.y0, x, area.y0 - area.alto);
            p.noStroke();
            p.fill(this.c.tenue);
            p.textAlign(p.CENTER, p.TOP);
            p.text(`${i} s`, x, area.y0 + 4);
        }
        for (let i = 0; i <= 2; i++) {
            const y = area.y0 - (i / 2) * area.alto;
            p.stroke(this.alfa('texto', 18));
            p.line(area.x0, y, area.x0 + area.ancho, y);
            p.noStroke();
            p.fill(this.c.tenue);
            p.textAlign(p.RIGHT, p.CENTER);
            p.text(f((vMax * i) / 2, vMax < 2 ? 1 : 0), area.x0 - 6, y);
        }
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text('v (m/s)', 4, area.y0 - area.alto - 4);

        // Curva v(t)
        p.noFill();
        p.stroke(this.c.cian);
        p.strokeWeight(2.5);
        p.beginShape();
        for (let i = 0; i < this._nMuestras; i++) {
            p.vertex(
                area.x0 + (this._muestrasT[i] / DURACION_S) * area.ancho,
                area.y0 - (this._muestrasV[i] / vMax) * area.alto
            );
        }
        p.endShape();

        // Punto actual
        const px = area.x0 + (this.t / DURACION_S) * area.ancho;
        const py = area.y0 - (this.v / vMax) * area.alto;
        p.noStroke();
        p.fill(this.c.texto);
        p.circle(px, py, 7);
    }
}
