// Formato de mensaje: saludo en la primera línea, el mensaje debajo empezando en mayúscula
// y la despedida sola en la última línea. Español y catalán.
(function (root) {
  const W = "[A-Za-zÀ-ÿ'’·]+";   // una palabra (con tildes, ç, l·l, apóstrofos)

  const GREET = {
    es: '(?:hola(?:,? buenas(?: (?:tardes|noches|días))?)?|buenas(?: (?:tardes|noches|días))?|buenos días|buen día|hey|ey|holi|holaa+|querid[oa]s?|estimad[oa]s?|muy buenas)',
    ca: '(?:hola(?:,? bon dia)?|bon dia|bona tarda|bona nit|bon vespre|bones|ei|ep|hola bones|benvolgu[dt]a?s?|estimad[ae]s?)',
  };
  // pregunta de cortesía que suele ir con el saludo («Hola Marta, ¿qué tal?»)
  const COURTESY = {
    es: '(?:¿\\s*)?(?:qué tal(?: estás| todo| va| vais| va todo)?|cómo estás|cómo va(?: todo)?|cómo vas|qué hay|cómo andas)\\s*\\??',
    ca: '(?:què tal(?: estàs| tot| va)?|com estàs|com va(?: tot)?|com anem|com vas)\\s*\\??',
  };
  const BYE = {
    es: '(?:un (?:fuerte )?abrazo(?: fuerte)?|abrazos|un (?:besito|beso)|besos|besitos|un saludo|saludos(?: cordiales)?|hasta (?:luego|pronto|mañana|ahora|después|la vista)|nos vemos(?: (?:luego|pronto|mañana|ahora|después|el \\S+))?|chao|chau|adiós|ciao|gracias|muchas gracias|mil gracias|cuídate|cuidaos|hablamos(?: (?:luego|mañana|después))?|venga,? (?:hasta luego|un abrazo|chao|nos vemos)|que vaya bien|buenas noches|buen día|feliz día|ya hablamos)',
    ca: '(?:una (?:forta )?abraçada|abraçades|un petó|petons|una salutació|salutacions|fins (?:després|aviat|demà|ara|una altra|la vista)|ens veiem(?: (?:després|aviat|demà|ara))?|adéu|adeu|ciao|gràcies|moltes gràcies|mil gràcies|cuida\'t|parlem(?: (?:després|demà))?|va,? (?:fins després|una abraçada|adéu)|que vagi bé|bona nit|bon dia)',
  };
  // palabras que no son nombres (no se ponen en mayúscula tras el saludo)
  const NOT_NAME = new Set(('a al los las la el todos todas todo chicos chicas chic chica gente equipo familia guapa guapo guapos guapas cariño amor amigo amiga amigos amigas ' +
    'tíos tío tía tías jefe jefa compañeros compis peña de del y e que qué com tots totes noies nois maca maco guapes guapos amics amigues família estimat estimada company companys').split(' '));
  const cap = (s) => s.replace(/^([¿¡"«]?\s*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());

  function nameCase(rest) {
    return rest.replace(new RegExp(W, 'g'), (w) => NOT_NAME.has(w.toLowerCase()) ? w : w[0].toUpperCase() + w.slice(1));
  }

  function splitGreeting(s, lang) {
    const g = new RegExp('^[¿¡]?\\s*(' + GREET[lang] + ')(?![\\p{L}])', 'iu').exec(s);
    if (!g) return null;
    let end = g[0].length, line = s.slice(0, end).replace(/^[¿¡]\s*/, '');
    let rest = s.slice(end);
    // nombre o destinatario: hasta 3 palabras seguidas de una coma, un punto, ! o :
    // (sin cruzar saltos de línea: lo de la línea siguiente ya es el mensaje)
    const nm = new RegExp('^,?[ ]*((?:' + W + '[ ]*){1,3}?)[ ]*([,.:!])', 'u').exec(rest);
    const plain = new RegExp('^[ ]+((?:' + W + ')(?:[ ]+' + W + ')?)(?=\\s|$)', 'u').exec(rest);
    if (nm && !new RegExp('^(' + COURTESY[lang] + ')', 'i').test(nm[1].trim()) && nm[1].trim().split(/\s+/).every((w, i) => i === 0 || /^\p{Lu}/u.test(w) || NOT_NAME.has(w.toLowerCase()))) {
      line += ' ' + nameCase(nm[1].trim()); rest = rest.slice(nm[0].length - 1);
    } else if (plain && /^\p{Lu}/u.test(plain[1])) {
      // sin puntuación: solo si parece un nombre propio (mayúscula), p. ej. «Hola Marta ya estoy…»
      const words = plain[1].split(/\s+/), keep = [words[0]];
      if (words[1] && /^\p{Lu}/u.test(words[1])) keep.push(words[1]);
      line += ' ' + keep.join(' '); rest = rest.slice(rest.indexOf(keep[keep.length - 1]) + keep[keep.length - 1].length);
    } else if (plain && /^\s*,?\s*a (todos|todas|tots|totes)\b/i.test(rest)) {
      const m = /^\s*,?\s*a (todos|todas|tots|totes)\b/i.exec(rest); line += ' a ' + m[1]; rest = rest.slice(m[0].length);
    }
    // signo que cierra el saludo
    let punct = '';
    const p = /^\s*([,.:!])/.exec(rest);
    if (p) { punct = p[1]; rest = rest.slice(p[0].length); }
    // pregunta de cortesía pegada al saludo
    const c = new RegExp('^\\s*,?\\s*(' + COURTESY[lang] + ')(?=[\\s.!?,]|$)', 'iu').exec(rest);
    if (c) {
      let q = c[1].trim().replace(/^¿\s*/, '').replace(/\?$/, '').replace(/^\p{Lu}/u, (x) => x.toLowerCase());
      line += ', ' + (lang === 'es' ? '¿' : '') + q + '?';
      rest = rest.slice(c[0].length).replace(/^\s*[?.,!]+/, '');
      punct = '';
    } else {
      line += punct === '!' ? '!' : punct === ':' ? ':' : ',';
    }
    line = cap(line);
    return { line, rest: rest.trim() };
  }

  function splitFarewell(s, lang) {
    const re = new RegExp('(^|[.!?…\\n]\\s*|,\\s*|\\s+)(' + BYE[lang] + '(?:\\s*,?\\s*' + W + '(?:\\s+' + W + ')?)?\\s*[.!]*)\\s*$', 'i');
    const m = re.exec(s);
    if (!m) return null;
    let body = s.slice(0, m.index) + (/^[,\s]/.test(m[1]) ? '' : m[1]);
    body = body.replace(/\s*,\s*$/, '').trim();
    if (body && !/[.!?…:]$/.test(body)) body += '.';
    let bye = cap(m[2].trim());
    if (!/[.!]$/.test(bye)) bye += '.';
    return { body, bye };
  }

  function formatMessage(text, lang) {
    lang = lang === 'ca' ? 'ca' : 'es';
    let s = String(text || '').replace(/[ \t]+/g, ' ').trim();
    if (!s) return s;
    let lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
    let first = lines.join('\n');
    let greet = '', bye = '';
    const g = splitGreeting(first, lang);
    if (g) { greet = g.line; first = g.rest; }
    const f = splitFarewell(first, lang);
    if (f) { bye = f.bye; first = f.body; }
    const body = first.split('\n').map((l) => cap(l.trim())).filter(Boolean).join('\n');
    return [greet, body, bye].filter(Boolean).join('\n');
  }

  // «¿» bien colocado: después de la coma si la pregunta empieza ahí («Hola Marta, ¿qué tal?»)
  const QWORDS = '(?:qué|que tal|cómo|cuándo|dónde|adónde|quién|quiénes|cuál|cuáles|cuánt[oa]s?|por qué|para qué|a qué|de qué|en qué|con quién|puedes|podrías|podéis|quieres|queréis|vienes|venís|sabes|sabéis|tienes|tenéis|te va|os va|vale|verdad|me (?:puedes|podrías|dices|llamas)|nos vemos|has|habéis|estás|estáis|vas|vais|hay)';
  function placeQuestionMark(sentenceBody) {
    const m = new RegExp('^(.*,\\s*)(' + QWORDS + '(?![\\p{L}]).*)$', 'iu').exec(sentenceBody);
    return m ? m[1] + '¿' + m[2] : '¿' + sentenceBody;
  }

  root.DictadoFormat = { formatMessage, placeQuestionMark };
  if (typeof module !== 'undefined') module.exports = root.DictadoFormat;
})(typeof window !== 'undefined' ? window : globalThis);
