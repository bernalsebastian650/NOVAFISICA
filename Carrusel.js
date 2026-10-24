/**
 * NOVAFÍSICA - Carrusel automático del Laboratorio Virtual (#interactivo)
 *
 * Solo DOM: no toca el estado del usuario. El desplazamiento lo anima CSS
 * (transform sobre .carousel-track); aquí solo se publica el índice activo
 * en la variable --carousel-index y se alternan clases/atributos.
 */
class Carrusel {
    static INTERVALO_MS = 3000;

    constructor(contenedor) {
        this.contenedor = contenedor;
        this.track = contenedor.querySelector('.carousel-track');
        this.slides = [...contenedor.querySelectorAll('.carousel-slide')];
        this.dots = [...contenedor.querySelectorAll('.dot')];
        this.indice = 0;
        this.temporizador = null;
        this.pausado = false;

        // Con reduced-motion no hay rotación automática: el usuario navega a su ritmo
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

        this._enlazarEventos();
        this.irA(0);
        this.iniciar();
    }

    _enlazarEventos() {
        this.contenedor.querySelector('.btn-prev').addEventListener('click', () => this._navegarManual(this.indice - 1));
        this.contenedor.querySelector('.btn-next').addEventListener('click', () => this._navegarManual(this.indice + 1));
        this.dots.forEach((dot, i) => dot.addEventListener('click', () => this._navegarManual(i)));

        // Pausa por interacción: cursor encima o foco de teclado dentro del carrusel
        this.contenedor.addEventListener('mouseenter', () => this.pausar());
        this.contenedor.addEventListener('mouseleave', () => this.reanudar());
        this.contenedor.addEventListener('focusin', () => this.pausar());
        this.contenedor.addEventListener('focusout', (e) => {
            if (!this.contenedor.contains(e.relatedTarget)) this.reanudar();
        });

        // Flechas del teclado cuando el foco está dentro del carrusel
        this.contenedor.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this._navegarManual(this.indice - 1);
            else if (e.key === 'ArrowRight') this._navegarManual(this.indice + 1);
        });

        // Pestaña oculta: se detiene el intervalo para no acumular saltos
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.detener();
            else this.iniciar();
        });
        this.reducedMotion.addEventListener('change', () => this.iniciar());
    }

    /** Muestra la diapositiva i (cíclico en ambos sentidos). */
    irA(i) {
        const total = this.slides.length;
        this.indice = ((i % total) + total) % total;

        this.track.style.setProperty('--carousel-index', this.indice); // dato para el transform en CSS
        this.slides.forEach((slide, n) => {
            const activa = n === this.indice;
            slide.classList.toggle('is-active', activa);
            slide.setAttribute('aria-hidden', String(!activa));
        });
        this.dots.forEach((dot, n) => {
            const activo = n === this.indice;
            dot.classList.toggle('is-active', activo);
            if (activo) dot.setAttribute('aria-current', 'true');
            else dot.removeAttribute('aria-current');
        });
    }

    siguiente() {
        this.irA(this.indice + 1);
    }

    /** Navegación por flecha/punto: reinicia el intervalo para evitar un doble salto inmediato. */
    _navegarManual(i) {
        this.irA(i);
        this.iniciar();
    }

    /** (Re)inicia el intervalo de 3 s si no hay pausa, pestaña oculta ni reduced-motion. */
    iniciar() {
        this.detener();
        if (this.pausado || document.hidden || this.reducedMotion.matches) return;
        this.temporizador = setInterval(() => this.siguiente(), Carrusel.INTERVALO_MS);
    }

    detener() {
        clearInterval(this.temporizador);
        this.temporizador = null;
    }

    pausar() {
        this.pausado = true;
        this.detener();
    }

    reanudar() {
        this.pausado = false;
        this.iniciar();
    }
}
