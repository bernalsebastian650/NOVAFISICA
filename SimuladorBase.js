/**
 * NOVAFÍSICA - Base común de los simuladores del Laboratorio Virtual (#interactivo).
 *
 * Ciclo de vida (lo orquesta Laboratorio.js; una sola instancia viva a la vez):
 *   new Subclase({ panel, colores }) → iniciar() → … → destruir()
 *
 * Responsabilidades:
 *   - Instancia de p5 en modo instancia, montada en el [data-lienzo] del panel.
 *   - Bucle de física con paso fijo (acumulador): el resultado no depende de los fps
 *     y un frame lento (pestaña en segundo plano) nunca produce un salto gigante.
 *   - Lectura de controles [data-param] y acciones [data-accion] por delegación de eventos.
 *     Todos los listeners cuelgan de un AbortController: destruir() los retira de una vez.
 *   - Lienzo responsivo (ResizeObserver) y pausa del dibujo fuera de pantalla (IntersectionObserver).
 *
 * Las subclases implementan: actualizar(dt), dibujar(p), y opcionalmente
 * alCambiarParametro(nombre, valor), alAccion(accion, boton), alRedimensionar(), altoPara(ancho).
 */
class SimuladorBase {
    static PASO_S = 1 / 120;      // paso fijo de integración
    static DT_MAX_S = 0.1;        // tope por frame: evita la "espiral de la muerte" tras una pausa
    static ANCHO_MIN = 280;

    static _formatos = new Map();

    /** Número con coma decimal (es-CO) y decimales fijos; los formateadores se reutilizan. */
    static formato(valor, decimales = 1) {
        let f = SimuladorBase._formatos.get(decimales);
        if (!f) {
            f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
            SimuladorBase._formatos.set(decimales, f);
        }
        return f.format(Math.abs(valor) < 1e-9 ? 0 : valor);
    }

    /**
     * @param {{panel: HTMLElement, colores: Record<string,string>}} opciones
     *   colores: valores hex leídos de :root (p5.color no entiende color-mix()).
     */
    constructor({ panel, colores }) {
        this.panel = panel;
        this.lienzo = panel.querySelector('[data-lienzo]');
        this.controles = panel.querySelector('[data-controles]');
        this.colores = colores;

        this.params = {};
        this.p = null;
        this.c = null;                 // colores p5 base
        this._alfas = new Map();       // colores con transparencia, cacheados (sin asignaciones por frame)
        this._acumulado = 0;
        this._abortar = new AbortController();
        this._observadorTamano = null;
        this._observadorVisibilidad = null;
        this._p5 = null;
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    iniciar() {
        if (this._p5) return;
        this.controles.querySelectorAll('input[type="range"][data-param]').forEach((input) => this._leerControl(input));

        const { signal } = this._abortar;
        this.controles.addEventListener('input', (e) => {
            const input = e.target.closest('input[type="range"][data-param]');
            if (!input) return;
            this._leerControl(input);
            this.alCambiarParametro(input.dataset.param, this.params[input.dataset.param]);
        }, { signal });
        this.controles.addEventListener('click', (e) => {
            const boton = e.target.closest('[data-accion]');
            if (boton) this.alAccion(boton.dataset.accion, boton);
        }, { signal });

        this._p5 = new p5((p) => this._definirSketch(p), this.lienzo);
    }

    /** Detiene el bucle, libera listeners/observadores y elimina el canvas del DOM. */
    destruir() {
        this._abortar.abort();
        if (this._observadorTamano) this._observadorTamano.disconnect();
        if (this._observadorVisibilidad) this._observadorVisibilidad.disconnect();
        if (this._p5) this._p5.remove();
        this._p5 = null;
        this.p = null;
        this._alfas.clear();
    }

    // ------------------------------------------------------------------
    // Ganchos para las subclases
    // ------------------------------------------------------------------

    actualizar(dt) {}
    dibujar(p) {}
    alCambiarParametro(nombre, valor) {}
    alAccion(accion, boton) {}
    alRedimensionar() {}
    altoPara(ancho) { return Math.round(Math.min(420, Math.max(300, ancho * 0.55))); }

    // ------------------------------------------------------------------
    // Utilidades de controles
    // ------------------------------------------------------------------

    /** Valor numérico + <output> asociado + relleno del track (--progreso es un dato, no una animación). */
    _leerControl(input) {
        const valor = Number(input.value);
        this.params[input.dataset.param] = valor;

        const min = Number(input.min), max = Number(input.max);
        input.style.setProperty('--progreso', `${((valor - min) / (max - min)) * 100}%`);

        const salida = this.controles.querySelector(`output[for="${input.id}"]`);
        if (salida) {
            const decimales = Number(input.dataset.decimales ?? 0);
            salida.textContent = `${SimuladorBase.formato(valor, decimales)}${input.dataset.unidad ?? ''}`;
        }
    }

    /** Fija un slider desde código (p. ej. preajustes) reutilizando el mismo flujo que el usuario. */
    fijarParametro(nombre, valor) {
        const input = this.controles.querySelector(`input[data-param="${nombre}"]`);
        if (!input) return;
        input.value = valor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    boton(accion) {
        return this.controles.querySelector(`[data-accion="${accion}"]`);
    }

    // ------------------------------------------------------------------
    // p5
    // ------------------------------------------------------------------

    _definirSketch(p) {
        p.setup = () => {
            this.p = p;
            const ancho = this._ancho();
            p.createCanvas(ancho, this.altoPara(ancho));
            p.textFont('Inter');
            this.c = Object.fromEntries(Object.entries(this.colores).map(([k, v]) => [k, p.color(v)]));
            this._observar(p);
            this.alRedimensionar();
        };

        p.draw = () => {
            const { PASO_S, DT_MAX_S } = SimuladorBase;
            this._acumulado += Math.min(p.deltaTime / 1000, DT_MAX_S);
            while (this._acumulado >= PASO_S) {
                this.actualizar(PASO_S);
                this._acumulado -= PASO_S;
            }
            this.dibujar(p);
        };
    }

    _ancho() {
        return Math.max(SimuladorBase.ANCHO_MIN, Math.floor(this.lienzo.clientWidth));
    }

    _observar(p) {
        if (typeof ResizeObserver !== 'undefined') {
            this._observadorTamano = new ResizeObserver(() => {
                const ancho = this._ancho();
                if (!this.p || ancho === p.width) return;
                p.resizeCanvas(ancho, this.altoPara(ancho));
                this.alRedimensionar();
            });
            this._observadorTamano.observe(this.lienzo);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this._observadorVisibilidad = new IntersectionObserver(([entrada]) => {
                if (!this.p) return;
                if (entrada.isIntersecting) {
                    this._acumulado = 0;
                    p.loop();
                } else {
                    p.noLoop();
                }
            });
            this._observadorVisibilidad.observe(this.lienzo);
        }
    }

    // ------------------------------------------------------------------
    // Utilidades de dibujo
    // ------------------------------------------------------------------

    /** Color base con alfa (0-255), creado una sola vez por combinación. */
    alfa(clave, a) {
        const id = `${clave}:${a}`;
        let color = this._alfas.get(id);
        if (!color) {
            color = this.p.color(this.colores[clave]);
            color.setAlpha(a);
            this._alfas.set(id, color);
        }
        return color;
    }

    /** Flecha de vector desde (x1,y1) hasta (x2,y2); no dibuja si el vector es despreciable. */
    flecha(p, x1, y1, x2, y2, color, grosor = 3) {
        const largo = Math.hypot(x2 - x1, y2 - y1);
        if (largo < 2) return;
        const punta = Math.min(10, largo * 0.45);
        const angulo = Math.atan2(y2 - y1, x2 - x1);
        p.stroke(color);
        p.strokeWeight(grosor);
        p.line(x1, y1, x2 - Math.cos(angulo) * punta * 0.6, y2 - Math.sin(angulo) * punta * 0.6);
        p.noStroke();
        p.fill(color);
        p.push();
        p.translate(x2, y2);
        p.rotate(angulo);
        p.triangle(0, 0, -punta, -punta * 0.55, -punta, punta * 0.55);
        p.pop();
    }

    /** Línea discontinua (p5 2D no tiene setLineDash nativo en su API). */
    lineaDiscontinua(p, x1, y1, x2, y2, trazo = 6, hueco = 5) {
        const ctx = p.drawingContext;
        ctx.setLineDash([trazo, hueco]);
        p.line(x1, y1, x2, y2);
        ctx.setLineDash([]);
    }

    /** Bloque de texto HUD (líneas) sobre un fondo translúcido. */
    hud(p, x, y, lineas, alineacion = 'izquierda') {
        p.textSize(13);
        p.textStyle(p.NORMAL);
        const alto = 18;
        let ancho = 0;
        for (const l of lineas) ancho = Math.max(ancho, p.textWidth(l));
        const caja = { w: ancho + 20, h: lineas.length * alto + 12 };
        const x0 = alineacion === 'derecha' ? x - caja.w : x;

        p.noStroke();
        p.fill(this.alfa('fondo', 200));
        p.rect(x0, y, caja.w, caja.h, 10);
        p.fill(this.c.texto);
        p.textAlign(p.LEFT, p.TOP);
        lineas.forEach((l, i) => p.text(l, x0 + 10, y + 8 + i * alto));
    }
}
