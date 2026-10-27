/**
 * NOVAFÍSICA - Banco de preguntas del Quiz XP (solo datos, sin lógica ni DOM).
 *
 * 20 preguntas de opción múltiple: 4 por cada una de las 5 temáticas oficiales.
 * `correcta` es el índice (0-3) de la opción correcta en el orden escrito aquí;
 * QuizXP baraja las opciones al mostrarlas.
 * Los `id` son estables: el historial de rotación del usuario los guarda en localStorage.
 */
const TEMAS_QUIZ = Object.freeze({
    cinematica: 'Cinemática y Tiro Parabólico',
    newton: 'Leyes de Newton',
    ondas: 'Fenómenos Ondulatorios',
    vectores: 'Vectores en la Física',
    hidrostatica: 'Presión Hidrostática'
});

const BANCO_PREGUNTAS = Object.freeze([
    // --- Cinemática y Tiro Parabólico ---
    {
        id: 'cin-1', tema: 'cinematica',
        enunciado: 'En un tiro parabólico sin rozamiento del aire, ¿qué ocurre con la componente horizontal de la velocidad?',
        opciones: ['Permanece constante', 'Aumenta durante el vuelo', 'Se anula en la altura máxima', 'Cambia de sentido al caer'],
        correcta: 0,
        explicacion: 'La única fuerza es la gravedad, que es vertical. En horizontal no hay aceleración: vx = v₀·cos θ no cambia.'
    },
    {
        id: 'cin-2', tema: 'cinematica',
        enunciado: 'En terreno plano y sin aire, ¿con qué ángulo de lanzamiento se consigue el mayor alcance horizontal?',
        opciones: ['30°', '45°', '60°', '90°'],
        correcta: 1,
        explicacion: 'El alcance es R = v₀²·sen(2θ)/g, que es máximo cuando sen(2θ) = 1, es decir, θ = 45°.'
    },
    {
        id: 'cin-3', tema: 'cinematica',
        enunciado: 'En el punto más alto de la trayectoria de un proyectil, su velocidad vertical es:',
        opciones: ['Máxima', 'Igual a la horizontal', 'Cero', 'Igual a g'],
        correcta: 2,
        explicacion: 'En la cima el proyectil deja de subir y empieza a bajar: la componente vertical pasa por cero (la horizontal sigue igual).'
    },
    {
        id: 'cin-4', tema: 'cinematica',
        enunciado: 'Se deja caer una piedra desde el reposo. Con g = 10 m/s², ¿qué rapidez tiene a los 3 segundos?',
        opciones: ['10 m/s', '45 m/s', '90 m/s', '30 m/s'],
        correcta: 3,
        explicacion: 'En caída libre desde el reposo v = g·t = 10 m/s² · 3 s = 30 m/s.'
    },

    // --- Leyes de Newton ---
    {
        id: 'new-1', tema: 'newton',
        enunciado: 'Sobre un cuerpo de 4 kg actúa una fuerza neta de 20 N. ¿Cuál es su aceleración?',
        opciones: ['5 m/s²', '80 m/s²', '0,2 m/s²', '24 m/s²'],
        correcta: 0,
        explicacion: 'Segunda ley de Newton: a = F/m = 20 N / 4 kg = 5 m/s².'
    },
    {
        id: 'new-2', tema: 'newton',
        enunciado: 'Si se duplica la masa de un objeto y la fuerza neta sigue siendo la misma, su aceleración:',
        opciones: ['Se duplica', 'Se reduce a la mitad', 'No cambia', 'Se cuadruplica'],
        correcta: 1,
        explicacion: 'Con a = F/m, si m se duplica y F no cambia, la aceleración queda dividida entre 2.'
    },
    {
        id: 'new-3', tema: 'newton',
        enunciado: 'Cuando un bus frena de golpe, los pasajeros se inclinan hacia adelante. ¿Qué ley lo explica?',
        opciones: ['Tercera ley (acción y reacción)', 'Ley de gravitación universal', 'Primera ley (inercia)', 'Principio de Pascal'],
        correcta: 2,
        explicacion: 'Por inercia, el cuerpo de los pasajeros tiende a seguir moviéndose a la velocidad que llevaba el bus.'
    },
    {
        id: 'new-4', tema: 'newton',
        enunciado: 'Cuando empujas una pared, la pared te empuja con una fuerza:',
        opciones: ['Nula, porque la pared no se mueve', 'Menor que la tuya', 'Mayor que la tuya', 'De igual magnitud y sentido contrario'],
        correcta: 3,
        explicacion: 'Tercera ley: las fuerzas de acción y reacción tienen igual magnitud, sentido opuesto y actúan sobre cuerpos distintos.'
    },

    // --- Fenómenos Ondulatorios ---
    {
        id: 'ond-1', tema: 'ondas',
        enunciado: 'Una onda tiene una frecuencia de 5 Hz y una longitud de onda de 2 m. ¿Cuál es su velocidad?',
        opciones: ['10 m/s', '2,5 m/s', '7 m/s', '0,4 m/s'],
        correcta: 0,
        explicacion: 'La velocidad de una onda es v = λ·f = 2 m · 5 Hz = 10 m/s.'
    },
    {
        id: 'ond-2', tema: 'ondas',
        enunciado: '¿Qué representa la amplitud de una onda?',
        opciones: [
            'La distancia entre dos crestas consecutivas',
            'El desplazamiento máximo respecto a la posición de equilibrio',
            'El número de oscilaciones por segundo',
            'El tiempo que tarda una oscilación completa'
        ],
        correcta: 1,
        explicacion: 'La amplitud es la máxima separación respecto al equilibrio. La distancia entre crestas es la longitud de onda λ.'
    },
    {
        id: 'ond-3', tema: 'ondas',
        enunciado: 'Si la frecuencia de una onda es 4 Hz, ¿cuál es su periodo?',
        opciones: ['4 s', '0,4 s', '0,25 s', '40 s'],
        correcta: 2,
        explicacion: 'El periodo es el inverso de la frecuencia: T = 1/f = 1/4 = 0,25 s.'
    },
    {
        id: 'ond-4', tema: 'ondas',
        enunciado: 'El sonido NO puede propagarse en:',
        opciones: ['El agua', 'El aire', 'El acero', 'El vacío'],
        correcta: 3,
        explicacion: 'El sonido es una onda mecánica: necesita un medio material que vibre. En el vacío no hay partículas que lo transmitan.'
    },

    // --- Vectores en la Física ---
    {
        id: 'vec-1', tema: 'vectores',
        enunciado: '¿Cuál de las siguientes es una magnitud vectorial?',
        opciones: ['La velocidad', 'La masa', 'La temperatura', 'El tiempo'],
        correcta: 0,
        explicacion: 'La velocidad necesita magnitud, dirección y sentido. Masa, temperatura y tiempo quedan definidos solo con un número (escalares).'
    },
    {
        id: 'vec-2', tema: 'vectores',
        enunciado: 'Dos fuerzas perpendiculares de 3 N y 4 N actúan sobre un cuerpo. ¿Cuál es la magnitud de la resultante?',
        opciones: ['7 N', '5 N', '1 N', '12 N'],
        correcta: 1,
        explicacion: 'Por ser perpendiculares se usa Pitágoras: R = √(3² + 4²) = √25 = 5 N.'
    },
    {
        id: 'vec-3', tema: 'vectores',
        enunciado: 'Dos fuerzas de 10 N actúan en la misma dirección pero en sentidos opuestos. La fuerza resultante es:',
        opciones: ['20 N', '10 N', '0 N', '5 N'],
        correcta: 2,
        explicacion: 'Al tener sentidos opuestos se restan: 10 N − 10 N = 0 N. El cuerpo queda en equilibrio.'
    },
    {
        id: 'vec-4', tema: 'vectores',
        enunciado: 'Un vector de magnitud 10 forma un ángulo de 30° con el eje x. ¿Cuál es su componente horizontal? (cos 30° ≈ 0,87)',
        opciones: ['5', '10', '3', '8,7'],
        correcta: 3,
        explicacion: 'La componente horizontal es Vx = V·cos θ = 10 · 0,87 = 8,7.'
    },

    // --- Presión Hidrostática ---
    {
        id: 'hid-1', tema: 'hidrostatica',
        enunciado: 'La presión hidrostática en un líquido en reposo depende de:',
        opciones: [
            'La profundidad, la densidad del líquido y la gravedad',
            'La forma del recipiente',
            'La cantidad total de líquido',
            'El área de la superficie libre'
        ],
        correcta: 0,
        explicacion: 'P = ρ·g·h: solo importan la densidad ρ, la gravedad g y la profundidad h, no la forma ni el volumen del recipiente.'
    },
    {
        id: 'hid-2', tema: 'hidrostatica',
        enunciado: '¿Cuál es la presión hidrostática a 10 m de profundidad en agua? (ρ = 1000 kg/m³, g = 10 m/s²)',
        opciones: ['1000 Pa', '100 000 Pa', '10 000 Pa', '1 000 000 Pa'],
        correcta: 1,
        explicacion: 'P = ρ·g·h = 1000 · 10 · 10 = 100 000 Pa, aproximadamente una atmósfera extra.'
    },
    {
        id: 'hid-3', tema: 'hidrostatica',
        enunciado: 'Un buzo baja de 5 m a 15 m de profundidad. La presión hidrostática del agua sobre él (sin contar la atmosférica):',
        opciones: ['Se mantiene igual', 'Se reduce a la tercera parte', 'Se triplica', 'Aumenta solo 10 Pa'],
        correcta: 2,
        explicacion: 'P = ρ·g·h es proporcional a la profundidad: si h pasa de 5 m a 15 m (el triple), la presión también se triplica.'
    },
    {
        id: 'hid-4', tema: 'hidrostatica',
        enunciado: 'Según el principio de Pascal, la presión aplicada a un fluido encerrado:',
        opciones: ['Solo actúa hacia abajo', 'Disminuye con la distancia', 'Se convierte en calor', 'Se transmite por igual a todos los puntos del fluido'],
        correcta: 3,
        explicacion: 'Es el fundamento de la prensa y los frenos hidráulicos: la presión se transmite íntegra a todo el fluido y a las paredes.'
    }
].map((p) => Object.freeze({ ...p, opciones: Object.freeze([...p.opciones]) })));
