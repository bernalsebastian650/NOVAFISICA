/**
 * NOVAFÍSICA - Laboratorio: Generador de Ondas (#interactivo, pestaña 3).
 *
 * Onda transversal en una cuerda, generada por un oscilador en el extremo izquierdo:
 *   s(t) = A(t) · sin(φ(t)),   φ += 2π · f · dt   (fase acumulada: cambiar f nunca produce saltos)
 * Cada punto de la cuerda repite lo que hizo la fuente x/v segundos antes:
 *   y(x, t) = s(t − x / v)
 * El historial de la fuente vive en un búfer circular preasignado (Float32Array): memoria constante
 * y, como en una cuerda real, un cambio de frecuencia o amplitud viaja hacia la derecha a velocidad v.
 *
 * Relaciones mostradas: T = 1/f, λ = v/f.
 */
class SimuladorOndas extends SimuladorBase {
    static VELOCIDAD = 1;            // m/s (constante del medio)
    static LONGITUD = 4;             // m de cuerda visibles
    static MUESTRAS_POR_S = 120;     // = 1 / PASO_S: una muestra de la fuente por paso de física
    static SUAVIZADO = 10;           // 1/s: la amplitud de la fuente sigue al slider sin "quiebres"
    static PASO_VERTICE_PX = 2;
    static X_PARTICULA = 2.5;        // m: partícula marcada (oscila en vertical, no avanza)
    static MARGEN = Object.freeze({ izq: 40, der: 16 });

    constructor(opciones) {
        super(opciones);
        const { LONGITUD, VELOCIDAD, MUESTRAS_POR_S } = SimuladorOndas;
        this._historial = new Float32Array(Math.ceil((LONGITUD / VELOCIDAD) * MUESTRAS_POR_S) + 2);
        this._cabeza = 0;            // índice de la muestra más reciente
        this._fase = 0;
        this._amplitud = 0;          // amplitud efectiva de la fuente (m), suavizada
        this._acumMuestra = 0;
        // Con reduced-motion la onda no arranca sola: el usuario decide cuándo reproducirla
        this.corriendo = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    get frecuencia() { return this.params.frecuencia; }
    get amplitudObjetivo() { return this.params.amplitud / 100; }   // slider en cm
    get longitudOnda() { return SimuladorOndas.VELOCIDAD / this.frecuencia; }

    // ------------------------------------------------------------------
    // Ganchos
    // ------------------------------------------------------------------

    iniciar() {
        super.iniciar();
        this._amplitud = this.amplitudObjetivo;
        this._sincronizarBotones();
    }

    alAccion(accion) {
        if (accion === 'alternar') this.corriendo = !this.corriendo;
        else if (accion === 'reiniciar') this._reiniciar();
        this._sincronizarBotones();
    }

    altoPara(ancho) {
        return Math.round(Math.min(380, Math.max(300, ancho * 0.48)));
    }

    _reiniciar() {
        this._historial.fill(0);
        this._fase = 0;
        this._acumMuestra = 0;
    }

    _sincronizarBotones() {
        const alternar = this.boton('alternar');
        if (!alternar) return;
        alternar.textContent = this.corriendo ? 'Pausar' : 'Reproducir';
        alternar.setAttribute('aria-pressed', String(this.corriendo));
    }

    actualizar(dt) {
        if (!this.corriendo) return;
        const { SUAVIZADO, MUESTRAS_POR_S } = SimuladorOndas;
        this._amplitud += (this.amplitudObjetivo - this._amplitud) * (1 - Math.exp(-SUAVIZADO * dt));
        this._fase = (this._fase + 2 * Math.PI * this.frecuencia * dt) % (2 * Math.PI);

        // Una muestra cada 1/MUESTRAS_POR_S s (coincide con el paso fijo, pero no depende de ello)
        this._acumMuestra += dt * MUESTRAS_POR_S;
        while (this._acumMuestra >= 1) {
            this._acumMuestra -= 1;
            this._cabeza = (this._cabeza + 1) % this._historial.length;
            this._historial[this._cabeza] = this._amplitud * Math.sin(this._fase);
        }
    }

    /** Desplazamiento (m) del punto x de la cuerda: muestra de la fuente con retardo x/v, interpolada. */
    desplazamiento(x) {
        const { VELOCIDAD, MUESTRAS_POR_S } = SimuladorOndas;
        const n = this._historial.length;
        const retardo = (x / VELOCIDAD) * MUESTRAS_POR_S;
        const i0 = Math.floor(retardo);
        const frac = retardo - i0;
        const a = this._historial[(this._cabeza - i0 + n * 2) % n];
        const b = this._historial[(this._cabeza - i0 - 1 + n * 2) % n];
        return a + (b - a) * frac;
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    dibujar(p) {
        const { LONGITUD, MARGEN, PASO_VERTICE_PX, X_PARTICULA } = SimuladorOndas;
        const f = SimuladorBase.formato;
        const x0 = MARGEN.izq;
        const ancho = p.width - MARGEN.izq - MARGEN.der;
        const escala = ancho / LONGITUD;            // px por metro (igual en ambos ejes)
        const cy = p.height * 0.58;
        const aPx = (m) => cy - m * escala;

        p.background(this.c.fondo);

        // Cuadrícula cada 0,5 m y posición de equilibrio
        p.strokeWeight(1);
        for (let m = 0; m <= LONGITUD + 1e-6; m += 0.5) {
            const x = x0 + m * escala;
            p.stroke(this.alfa('texto', Number.isInteger(m) ? 22 : 10));
            p.line(x, 0, x, p.height);
        }
        p.stroke(this.alfa('tenue', 130));
        this.lineaDiscontinua(p, x0, cy, x0 + ancho, cy);
        p.noStroke();
        p.fill(this.c.tenue);
        p.textSize(10);
        p.textAlign(p.CENTER, p.BOTTOM);
        for (let m = 0; m <= LONGITUD; m++) p.text(`${m} m`, x0 + m * escala, p.height - 6);

        // Envolvente de amplitud (banda ±A)
        const aObjetivo = this.amplitudObjetivo * escala;
        p.fill(this.alfa('cian', 14));
        p.rect(x0, cy - aObjetivo, ancho, aObjetivo * 2);

        // Cuerda
        p.noFill();
        p.stroke(this.c.cian);
        p.strokeWeight(3);
        p.beginShape();
        for (let px = 0; px <= ancho; px += PASO_VERTICE_PX) {
            p.vertex(x0 + px, aPx(this.desplazamiento(px / escala)));
        }
        p.endShape();

        // Oscilador (fuente) y partícula marcada
        const ys = aPx(this.desplazamiento(0));
        p.stroke(this.alfa('violeta', 120));
        p.strokeWeight(2);
        p.line(x0 - 18, cy, x0 - 18, ys);
        p.noStroke();
        p.fill(this.c.violeta);
        p.rect(x0 - 26, ys - 8, 16, 16, 4);

        const xp = x0 + X_PARTICULA * escala;
        const yp = aPx(this.desplazamiento(X_PARTICULA));
        p.stroke(this.alfa('teal', 90));
        p.strokeWeight(1);
        this.lineaDiscontinua(p, xp, cy - aObjetivo - 6, xp, cy + aObjetivo + 6, 3, 3);
        p.noStroke();
        p.fill(this.c.teal);
        p.circle(xp, yp, 12);

        this._dibujarCotas(p, x0, cy, escala, aObjetivo);

        this.hud(p, x0 + 8, 12, [
            `f = ${f(this.frecuencia, 1)} Hz    T = 1/f = ${f(1 / this.frecuencia, 2)} s`,
            `λ = v/f = ${f(this.longitudOnda, 2)} m    A = ${f(this.params.amplitud, 0)} cm`,
            `v = ${f(SimuladorOndas.VELOCIDAD, 1)} m/s${this.corriendo ? '' : '   (en pausa)'}`
        ]);
    }

    /** Cotas de A (junto a la fuente) y λ (en la zona cercana, donde la onda ya refleja la f actual). */
    _dibujarCotas(p, x0, cy, escala, aPx) {
        const f = SimuladorBase.formato;
        p.textSize(11);

        // A
        if (aPx > 6) {
            const xa = x0 + 6;
            p.stroke(this.alfa('violeta', 200));
            p.strokeWeight(1.5);
            p.line(xa, cy, xa, cy - aPx);
            p.line(xa - 4, cy - aPx, xa + 4, cy - aPx);
            p.noStroke();
            p.fill(this.c.violeta);
            p.textAlign(p.LEFT, p.CENTER);
            p.text('A', xa + 6, cy - aPx / 2);
        }

        // λ
        const lambdaPx = this.longitudOnda * escala;
        const ancho = p.width - x0 - SimuladorOndas.MARGEN.der;
        if (lambdaPx > 24 && lambdaPx < ancho * 0.9) {
            const x1 = x0 + Math.min(0.25 * escala, ancho - lambdaPx);
            const y = cy + aPx + 22;
            p.stroke(this.alfa('teal', 200));
            p.strokeWeight(1.5);
            p.line(x1, y, x1 + lambdaPx, y);
            p.line(x1, y - 5, x1, y + 5);
            p.line(x1 + lambdaPx, y - 5, x1 + lambdaPx, y + 5);
            p.noStroke();
            p.fill(this.c.teal);
            p.textAlign(p.CENTER, p.TOP);
            p.text(`λ = ${f(this.longitudOnda, 2)} m`, x1 + lambdaPx / 2, y + 4);
        }
    }
}
