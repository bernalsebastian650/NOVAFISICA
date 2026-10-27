/**
 * NOVAFÍSICA - Quiz XP (sección #quiz-xp).
 *
 * Responsabilidades:
 *   - Rotación del banco (función pura `seleccionarBloque`): cada intento toma 5 preguntas,
 *     una por temática, entre las que el usuario aún no ha visto en el ciclo actual. Al agotar
 *     las 20 empieza un ciclo nuevo. El bloque se marca como visto al sortearlo (recargar la
 *     página no permite "re-sortear" preguntas más fáciles).
 *   - Interfaz: inicio → pregunta X de 5 (validación inmediata) → resultados.
 *
 * No conoce GestorProgreso ni localStorage: recibe el historial y avisa de los aciertos por
 * callbacks, igual que los simuladores.
 */
class QuizXP {
    static PREGUNTAS_POR_BLOQUE = 5;
    static XP_POR_ACIERTO = 50;
    static LETRAS = Object.freeze(['A', 'B', 'C', 'D']);

    // ------------------------------------------------------------------
    // Rotación (pura: sin DOM ni almacenamiento; `aleatorio` inyectable para pruebas)
    // ------------------------------------------------------------------

    /** Fisher-Yates sobre una copia. */
    static barajar(lista, aleatorio = Math.random) {
        const copia = [...lista];
        for (let i = copia.length - 1; i > 0; i--) {
            const j = Math.floor(aleatorio() * (i + 1));
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia;
    }

    /** Hasta n preguntas: primero una por tema distinto, luego completa con las restantes. */
    static _tomarVariadas(lista, n, aleatorio) {
        const barajada = QuizXP.barajar(lista, aleatorio);
        const elegidas = [];
        const temas = new Set();
        for (const p of barajada) {
            if (elegidas.length === n) break;
            if (!temas.has(p.tema)) {
                temas.add(p.tema);
                elegidas.push(p);
            }
        }
        for (const p of barajada) {
            if (elegidas.length === n) break;
            if (!elegidas.includes(p)) elegidas.push(p);
        }
        return elegidas;
    }

    /**
     * @param {ReadonlyArray<{id: string, tema: string}>} banco
     * @param {string[]} historial  ids ya vistos en el ciclo actual
     * @returns {{preguntas: object[], historial: string[], ronda: number, rondas: number}}
     */
    static seleccionarBloque(banco, historial, n = QuizXP.PREGUNTAS_POR_BLOQUE, aleatorio = Math.random) {
        const idsBanco = new Set(banco.map((p) => p.id));
        const vistos = new Set(historial.filter((id) => idsBanco.has(id)));   // ignora ids retirados del banco
        const disponibles = banco.filter((p) => !vistos.has(p.id));

        let elegidas = QuizXP._tomarVariadas(disponibles, n, aleatorio);
        let nuevoHistorial;
        if (elegidas.length < n) {
            // Ciclo agotado: lo que quedaba + preguntas del ciclo nuevo (sin repetir dentro del bloque)
            const resto = QuizXP._tomarVariadas(banco.filter((p) => !elegidas.includes(p)), n - elegidas.length, aleatorio);
            elegidas = [...elegidas, ...resto];
            nuevoHistorial = resto.map((p) => p.id);
        } else {
            nuevoHistorial = [...vistos, ...elegidas.map((p) => p.id)];
        }

        const rondas = Math.ceil(banco.length / n);
        return {
            preguntas: QuizXP.barajar(elegidas, aleatorio),
            historial: nuevoHistorial,
            ronda: Math.max(1, Math.ceil(nuevoHistorial.length / n)),
            rondas
        };
    }

    // ------------------------------------------------------------------
    // Interfaz
    // ------------------------------------------------------------------

    /**
     * @param {{
     *   contenedor: HTMLElement,
     *   banco: ReadonlyArray<object>,
     *   temas: Record<string, string>,
     *   obtenerHistorial: () => string[],
     *   guardarHistorial: (ids: string[]) => void,
     *   alAcertar: (xp: number) => void
     * }} opciones
     */
    constructor({ contenedor, banco, temas, obtenerHistorial, guardarHistorial, alAcertar }) {
        this.contenedor = contenedor;
        this.banco = banco;
        this.temas = temas;
        this._obtenerHistorial = obtenerHistorial;
        this._guardarHistorial = guardarHistorial;
        this._alAcertar = alAcertar;

        this.bloque = [];
        this.indice = 0;
        this.respuestas = [];      // true/false por pregunta respondida
        this.ronda = 1;
        this.rondas = Math.ceil(banco.length / QuizXP.PREGUNTAS_POR_BLOQUE);
        this._opcionesActuales = [];

        this._mostrarInicio({ enfocar: false });
    }

    get aciertos() { return this.respuestas.filter(Boolean).length; }
    get xpGanada() { return this.aciertos * QuizXP.XP_POR_ACIERTO; }

    comenzar() {
        const sorteo = QuizXP.seleccionarBloque(this.banco, this._obtenerHistorial());
        this._guardarHistorial(sorteo.historial);
        this.bloque = sorteo.preguntas;
        this.ronda = sorteo.ronda;
        this.rondas = sorteo.rondas;
        this.indice = 0;
        this.respuestas = [];
        this._mostrarPregunta();
    }

    // ------------------------------------------------------------------
    // Pantallas
    // ------------------------------------------------------------------

    _mostrarInicio({ enfocar = true } = {}) {
        const vistos = this._obtenerHistorial().length;
        const porBloque = QuizXP.PREGUNTAS_POR_BLOQUE;
        const proximaRonda = vistos >= this.banco.length ? 1 : Math.floor(vistos / porBloque) + 1;

        const pantalla = this._pantalla('quiz-screen--intro');
        const titulo = QuizXP._crear('h3', 'quiz-title', '¿Listo para ganar XP?');
        const texto = QuizXP._crear('p', 'quiz-text',
            `Responde ${porBloque} preguntas, una de cada temática. Ganas +${QuizXP.XP_POR_ACIERTO} XP por cada acierto y ` +
            `las preguntas no se repiten hasta completar el banco de ${this.banco.length}.`);

        const temas = QuizXP._crear('ul', 'quiz-topics');
        temas.setAttribute('aria-label', 'Temáticas del quiz');
        Object.values(this.temas).forEach((nombre) => temas.append(QuizXP._crear('li', 'quiz-topic', nombre)));

        const ronda = QuizXP._crear('p', 'quiz-round', `Ronda ${proximaRonda} de ${this.rondas} del banco`);
        const boton = QuizXP._crear('button', 'btn btn-nebula quiz-cta', 'Comenzar Quiz');
        boton.type = 'button';
        boton.addEventListener('click', () => this.comenzar());

        pantalla.append(titulo, texto, temas, ronda, boton);
        this._montar(pantalla, enfocar ? titulo : null);
    }

    _mostrarPregunta() {
        const total = this.bloque.length;
        const pregunta = this.bloque[this.indice];
        const pantalla = this._pantalla('quiz-screen--question');

        // Encabezado: contador + recompensa
        const cabecera = QuizXP._crear('div', 'quiz-top');
        const contador = QuizXP._crear('span', 'quiz-counter', `Pregunta ${this.indice + 1} de ${total}`);
        const premio = QuizXP._crear('span', 'quiz-reward', `+${QuizXP.XP_POR_ACIERTO} XP por acierto`);
        cabecera.append(contador, premio);

        const progreso = this._barraProgreso();

        const tema = QuizXP._crear('span', 'quiz-topic quiz-topic--current', this.temas[pregunta.tema] ?? pregunta.tema);
        const enunciado = QuizXP._crear('h3', 'quiz-question', pregunta.enunciado);
        enunciado.id = `quiz-enunciado-${pregunta.id}`;

        // Opciones barajadas en cada presentación (la posición de la correcta no se memoriza)
        this._opcionesActuales = QuizXP.barajar(
            pregunta.opciones.map((texto, i) => ({ texto, esCorrecta: i === pregunta.correcta }))
        );
        const grupo = QuizXP._crear('div', 'quiz-options');
        grupo.setAttribute('role', 'group');
        grupo.setAttribute('aria-labelledby', enunciado.id);
        const botones = this._opcionesActuales.map((opcion, i) => {
            const boton = QuizXP._crear('button', 'quiz-option');
            boton.type = 'button';
            boton.style.setProperty('--i', i);   // índice de escalonamiento (dato, la animación vive en CSS)
            boton.append(QuizXP._crear('span', 'quiz-letter', QuizXP.LETRAS[i]), QuizXP._crear('span', 'quiz-option-text', opcion.texto));
            boton.addEventListener('click', () => this._responder(i, botones, retro, siguiente));
            return boton;
        });
        grupo.append(...botones);

        const retro = QuizXP._crear('div', 'quiz-feedback');
        retro.setAttribute('role', 'status');
        retro.hidden = true;

        const pie = QuizXP._crear('div', 'quiz-footer');
        const ultima = this.indice === total - 1;
        const siguiente = QuizXP._crear('button', 'btn btn-nebula quiz-next', ultima ? 'Ver resultados' : 'Siguiente pregunta');
        siguiente.type = 'button';
        siguiente.disabled = true;
        siguiente.addEventListener('click', () => {
            if (ultima) {
                this._mostrarResultado();
            } else {
                this.indice += 1;
                this._mostrarPregunta();
            }
        });
        pie.append(siguiente);

        pantalla.append(cabecera, progreso, tema, enunciado, grupo, retro, pie);
        this._montar(pantalla, this.indice === 0 ? contador : enunciado);
    }

    /** Validación inmediata. Cada pregunta se responde una sola vez: el XP no se puede duplicar. */
    _responder(elegida, botones, retro, siguiente) {
        if (this.respuestas.length > this.indice) return;

        const correcta = this._opcionesActuales[elegida].esCorrecta;
        this.respuestas.push(correcta);

        botones.forEach((boton, i) => {
            boton.disabled = true;
            if (this._opcionesActuales[i].esCorrecta) boton.classList.add('is-correct');
            else if (i === elegida) boton.classList.add('is-wrong');
            else boton.classList.add('is-dimmed');
        });
        botones[elegida].setAttribute('aria-describedby', 'quiz-retro');

        const pregunta = this.bloque[this.indice];
        retro.id = 'quiz-retro';
        retro.classList.add(correcta ? 'is-correct' : 'is-wrong');
        retro.replaceChildren(
            QuizXP._crear('strong', 'quiz-feedback-title', correcta ? `¡Correcto! +${QuizXP.XP_POR_ACIERTO} XP` : 'Respuesta incorrecta'),
            QuizXP._crear('p', 'quiz-feedback-text', pregunta.explicacion)
        );
        retro.hidden = false;

        const segmento = this.contenedor.querySelectorAll('.quiz-progress-step')[this.indice];
        if (segmento) segmento.classList.add(correcta ? 'is-correct' : 'is-wrong');

        siguiente.disabled = false;
        siguiente.focus();

        if (correcta && this._alAcertar) this._alAcertar(QuizXP.XP_POR_ACIERTO);
    }

    _mostrarResultado() {
        const total = this.bloque.length;
        const pantalla = this._pantalla('quiz-screen--result');

        const titulo = QuizXP._crear('h3', 'quiz-title', '¡Quiz completado!');
        const resumen = QuizXP._crear('div', 'quiz-summary');
        const tarjeta = (valor, etiqueta, clase) => {
            const t = QuizXP._crear('div', `quiz-stat ${clase}`);
            t.append(QuizXP._crear('span', 'quiz-stat-value', valor), QuizXP._crear('span', 'quiz-stat-label', etiqueta));
            return t;
        };
        resumen.append(
            tarjeta(`${this.aciertos}/${total}`, 'Aciertos', 'quiz-stat--score'),
            tarjeta(`+${this.xpGanada} XP`, 'XP obtenida en este intento', 'quiz-stat--xp')
        );

        const mensaje = QuizXP._crear('p', 'quiz-text', QuizXP._mensaje(this.aciertos, total));

        const repaso = QuizXP._crear('ol', 'quiz-review');
        repaso.setAttribute('aria-label', 'Repaso de respuestas');
        this.bloque.forEach((p, i) => {
            const item = QuizXP._crear('li', `quiz-review-item ${this.respuestas[i] ? 'is-correct' : 'is-wrong'}`);
            item.append(
                QuizXP._crear('span', 'quiz-review-icon', this.respuestas[i] ? '✓' : '✗'),
                QuizXP._crear('span', 'quiz-review-topic', this.temas[p.tema] ?? p.tema)
            );
            item.setAttribute('aria-label', `${this.temas[p.tema]}: ${this.respuestas[i] ? 'correcta' : 'incorrecta'}`);
            repaso.append(item);
        });

        const cicloCompleto = this.ronda >= this.rondas;
        const nota = QuizXP._crear('p', 'quiz-round', cicloCompleto
            ? '¡Completaste todo el banco! El próximo quiz inicia un ciclo nuevo.'
            : `Siguiente: ronda ${this.ronda + 1} de ${this.rondas}, con preguntas que aún no has visto.`);

        const boton = QuizXP._crear('button', 'btn btn-nebula quiz-cta', 'Jugar otro quiz');
        boton.type = 'button';
        boton.addEventListener('click', () => this.comenzar());

        pantalla.append(titulo, resumen, mensaje, repaso, nota, boton);
        this._montar(pantalla, titulo);
    }

    static _mensaje(aciertos, total) {
        if (aciertos === total) return '¡Puntaje perfecto! Dominas los cinco temas.';
        if (aciertos >= total - 1) return '¡Excelente trabajo! Estás muy cerca de la perfección.';
        if (aciertos >= Math.ceil(total / 2)) return 'Buen resultado. Revisa las explicaciones y sigue practicando.';
        return 'Cada intento suma: explora el laboratorio y los videos, y vuelve a intentarlo.';
    }

    // ------------------------------------------------------------------
    // Utilidades DOM
    // ------------------------------------------------------------------

    _barraProgreso() {
        const lista = QuizXP._crear('ol', 'quiz-progress');
        lista.setAttribute('aria-hidden', 'true');   // el contador textual ya informa el avance
        this.bloque.forEach((_, i) => {
            let clase = 'quiz-progress-step';
            if (i < this.respuestas.length) clase += this.respuestas[i] ? ' is-correct' : ' is-wrong';
            else if (i === this.indice) clase += ' is-current';
            lista.append(QuizXP._crear('li', clase));
        });
        return lista;
    }

    _pantalla(modificador) {
        return QuizXP._crear('div', `quiz-screen ${modificador}`);
    }

    /** Sustituye la pantalla; el foco se mueve solo tras una acción del usuario (no al cargar la página). */
    _montar(pantalla, enfocar) {
        this.contenedor.replaceChildren(pantalla);
        if (enfocar) {
            enfocar.tabIndex = -1;
            enfocar.focus({ preventScroll: true });
        }
    }

    /** textContent siempre: el contenido nunca se interpreta como HTML. */
    static _crear(etiqueta, clase = '', texto = '') {
        const el = document.createElement(etiqueta);
        if (clase) el.className = clase;
        if (texto) el.textContent = texto;
        return el;
    }
}
