/**
 * NOVAFÍSICA - Pestañas del Laboratorio Virtual (#interactivo).
 *
 * Patrón WAI-ARIA "tabs" con activación automática (flechas, Inicio, Fin).
 * Ciclo de vida: solo existe UN simulador vivo. Al cambiar de pestaña el anterior se destruye
 * (p5.remove(): detiene su bucle, retira el canvas y sus listeners) antes de crear el siguiente,
 * por lo que nunca se superponen bucles de dibujo. Los sliders conservan su valor en el DOM,
 * así que al volver a una pestaña el simulador se recrea con los parámetros que dejó el usuario.
 */
class Laboratorio {
    /**
     * @param {HTMLElement} raiz  contenedor con [role="tablist"] y los [role="tabpanel"]
     * @param {Record<string, (panel: HTMLElement) => SimuladorBase>} fabricas  clave = data-simulador de la pestaña
     */
    constructor(raiz, fabricas) {
        this.raiz = raiz;
        this.fabricas = fabricas;
        this.pestanas = [...raiz.querySelectorAll('[role="tab"]')];
        this.activa = null;
        this.simulador = null;
        this._abortar = new AbortController();

        const { signal } = this._abortar;
        this.pestanas.forEach((pestana) => {
            pestana.addEventListener('click', () => this.activar(pestana), { signal });
            pestana.addEventListener('keydown', (e) => this._alTeclear(e), { signal });
        });

        const inicial = this.pestanas.find((t) => t.getAttribute('aria-selected') === 'true') ?? this.pestanas[0];
        if (inicial) this.activar(inicial);
    }

    activar(pestana) {
        if (pestana === this.activa) return;

        if (this.simulador) {
            this.simulador.destruir();
            this.simulador = null;
        }

        this.pestanas.forEach((t) => {
            const seleccionada = t === pestana;
            t.setAttribute('aria-selected', String(seleccionada));
            t.tabIndex = seleccionada ? 0 : -1;
            document.getElementById(t.getAttribute('aria-controls')).hidden = !seleccionada;
        });
        this.activa = pestana;

        // El panel ya es visible (hidden = false): el canvas toma su ancho real al crearse
        const panel = document.getElementById(pestana.getAttribute('aria-controls'));
        const fabrica = this.fabricas[pestana.dataset.simulador];
        if (!fabrica) return;
        this.simulador = fabrica(panel);
        this.simulador.iniciar();
    }

    destruir() {
        this._abortar.abort();
        if (this.simulador) this.simulador.destruir();
        this.simulador = null;
    }

    _alTeclear(e) {
        const i = this.pestanas.indexOf(e.currentTarget);
        const n = this.pestanas.length;
        const destino = {
            ArrowRight: (i + 1) % n,
            ArrowLeft: (i - 1 + n) % n,
            Home: 0,
            End: n - 1
        }[e.key];
        if (destino === undefined) return;
        e.preventDefault();
        this.pestanas[destino].focus();
        this.activar(this.pestanas[destino]);
    }
}
