// Formato de mensaje: saludo en la primera línea, el mensaje debajo empezando en mayúscula
// y la despedida sola en la última línea. Español, catalán, inglés, francés, italiano, alemán y portugués.
(function (root) {
  const W = "[A-Za-zÀ-ÿ'’·]+";   // una palabra (con tildes, ç, l·l, apóstrofos)

  const GREET = {
    es: '(?:hola(?:,? buenas(?: (?:tardes|noches|días))?)?|buenas(?: (?:tardes|noches|días))?|buenos días|buen día|hey|ey|holi|holaa+|querid[oa]s?|estimad[oa]s?|muy buenas)',
    ca: '(?:hola(?:,? bon dia)?|bon dia|bona tarda|bona nit|bon vespre|bones|ei|ep|hola bones|benvolgu[dt]a?s?|estimad[ae]s?)',
    en: '(?:hi|hello|hey|hiya|good morning|good afternoon|good evening|morning|dear|hi there|hello there)',
    fr: '(?:bonjour|salut|coucou|bonsoir|cher|chère|chers|chères|hello)',
    it: '(?:ciao|buongiorno|buon giorno|buonasera|buona sera|salve|caro|cara|cari|care|ehi)',
    de: '(?:hallo|hi|hey|guten morgen|guten tag|guten abend|servus|moin|grüß dich|liebe|lieber|liebes)',
    pt: '(?:olá|ola|oi|bom dia|boa tarde|boa noite|querido|querida|queridos|caro|cara)',
  };
  // pregunta de cortesía que suele ir con el saludo («Hola Marta, ¿qué tal?»)
  const COURTESY = {
    es: '(?:¿\\s*)?(?:qué tal(?: estás| todo| va| vais| va todo)?|cómo estás|cómo va(?: todo)?|cómo vas|qué hay|cómo andas)\\s*\\??',
    ca: '(?:què tal(?: estàs| tot| va)?|com estàs|com va(?: tot)?|com anem|com vas)\\s*\\??',
    en: '(?:how are you(?: doing)?|how\'s it going|how are things|how\'s everything|what\'s up|you ok|you alright)\\s*\\??',
    fr: '(?:ça va|comment ça va|comment vas-tu|comment allez-vous|tu vas bien|vous allez bien)\\s*\\??',
    it: '(?:come stai|come va|tutto bene|come state)\\s*\\??',
    de: '(?:wie geht\'s|wie geht es dir|wie geht es ihnen|alles gut|alles klar)\\s*\\??',
    pt: '(?:tudo bem|tudo bom|como estás|como está|como vai|como vais)\\s*\\??',
  };
  const BYE = {
    es: '(?:un (?:fuerte )?abrazo(?: fuerte)?|abrazos|un (?:besito|beso)|besos|besitos|un saludo|saludos(?: cordiales)?|hasta (?:luego|pronto|mañana|ahora|después|la vista)|nos vemos(?: (?:luego|pronto|mañana|ahora|después|el \\S+))?|chao|chau|adiós|ciao|gracias|muchas gracias|mil gracias|cuídate|cuidaos|hablamos(?: (?:luego|mañana|después))?|venga,? (?:hasta luego|un abrazo|chao|nos vemos)|que vaya bien|buenas noches|buen día|feliz día|ya hablamos)',
    ca: '(?:una (?:forta )?abraçada|abraçades|un petó|petons|una salutació|salutacions|fins (?:després|aviat|demà|ara|una altra|la vista)|ens veiem(?: (?:després|aviat|demà|ara))?|adéu|adeu|ciao|gràcies|moltes gràcies|mil gràcies|cuida\'t|parlem(?: (?:després|demà))?|va,? (?:fins després|una abraçada|adéu)|que vagi bé|bona nit|bon dia)',
    en: '(?:see you(?: (?:soon|later|tomorrow|then))?|see ya|bye(?: for now)?|goodbye|cheers|thanks(?: a lot| so much)?|thank you(?: so much)?|best(?: wishes| regards)?|kind regards|regards|love|lots of love|take care|talk (?:soon|later)|speak soon|catch you later|hugs|xx+|have a (?:nice|good|great) (?:day|evening|weekend)|good night)',
    fr: '(?:à bientôt|a bientôt|à plus(?: tard)?|à demain|à tout à l\'heure|à tout de suite|bisous|gros bisous|bises|je t\'embrasse|merci(?: beaucoup| bien)?|bonne (?:journée|soirée|nuit)|cordialement|bien à (?:toi|vous)|salut|ciao|amitiés|à la prochaine)',
    it: '(?:a presto|a dopo|a domani|ci vediamo(?: dopo| domani| presto)?|ciao|un abbraccio|un bacio|baci|bacioni|grazie(?: mille)?|buona (?:giornata|serata|notte)|cordiali saluti|saluti|un saluto)',
    de: '(?:bis (?:bald|später|morgen|dann|gleich)|tschüss|tschüs|ciao|danke(?: schön| dir)?|vielen dank|liebe grüße|viele grüße|schöne grüße|herzliche grüße|mit freundlichen grüßen|gruß|grüße|lg|schönen (?:tag|abend)|gute nacht)',
    pt: '(?:até (?:logo|já|amanhã|breve|mais)|um (?:abraço|beijo|beijinho)|abraços|beijos|beijinhos|obrigad[oa](?: pela ajuda)?|muito obrigad[oa]|cumprimentos|tchau|xau|bom dia|boa noite|fica bem)',
  };
  // palabras que no son nombres (no se ponen en mayúscula tras el saludo)
  const NOT_NAME = new Set(('a al los las la el todos todas todo chicos chicas chic chica gente equipo familia guapa guapo guapos guapas cariño amor amigo amiga amigos amigas ' +
    'tíos tío tía tías jefe jefa compañeros compis peña de del y e que qué com tots totes noies nois maca maco guapes guapos amics amigues família estimat estimada company companys ' +
    'all everyone everybody guys team folks there you mate darling love honey dear tous tout le monde les amis chéri chérie tutti ragazzi amore zusammen alle leute schatz todos pessoal amor gente').split(' '));
  const cap = (s) => s.replace(/^([¿¡"«]?\s*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());

  function nameCase(rest) {
    return rest.replace(new RegExp(W, 'g'), (w) => NOT_NAME.has(w.toLowerCase()) ? w : w[0].toUpperCase() + w.slice(1));
  }

  function splitGreeting(s, lang) {
    if (!GREET[lang]) return null;
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
    if (!BYE[lang]) return null;
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
    lang = GREET[lang] ? lang : 'xx';   // idioma sin reglas: solo mayúsculas
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

  // «Mis palabras»: corrige nombres mal oídos comparándolos con la lista del usuario.
  // Prudente para no estropear palabras normales: solo cambia (a) la misma palabra con otras mayúsculas o tildes
  // («jordi» → «Jordi», «barca» → «Barça») o (b) palabras que ya vienen con mayúscula a mitad de frase (nombres propios)
  // y se parecen mucho («Fordy» → «Jordi»), y (c) dos palabras con mayúscula que juntas son de la lista («Villa Franca» → «Vilafranca»).
  const plain = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ç/g, 'c').replace(/[·'’]/g, '').toLowerCase();
  function dist(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // y ↔ i, v ↔ b, s ↔ z/ç… cuentan como medio error (suenan igual)
  const sound = (w) => plain(w).replace(/y/g, 'i').replace(/v/g, 'b').replace(/[zç]/g, 's').replace(/h/g, '').replace(/ll/g, 'l');
  function fixVocab(text, list) {
    const words = String(list || '').split(/[,;\n]+/).map((w) => w.trim()).filter((w) => w.length >= 3);
    if (!words.length || !text) return text;
    const exact = new Map(words.map((w) => [plain(w), w]));
    const best = (cand) => {
      let found = null, bd = 9;
      for (const w of words) {
        if (w.includes(' ')) continue;
        const L = Math.max(w.length, cand.length);
        if (L < 4 || Math.abs(w.length - cand.length) > 2) continue;
        const dd = dist(sound(cand), sound(w));
        if (dd <= (L >= 7 ? 2 : 1) && dd < bd) { bd = dd; found = w; }
      }
      return found;
    };
    // (c) dos palabras con mayúscula seguidas
    text = text.replace(new RegExp('(\\p{Lu}' + W.replace(/\+$/, '*') + ')\\s+(\\p{Lu}' + W.replace(/\+$/, '*') + ')', 'gu'), (m, a, b) => {
      const j = plain(a + b);
      if (exact.has(j)) return exact.get(j);
      const f = words.find((w) => !w.includes(' ') && w.length >= 6 && dist(sound(a + b), sound(w)) <= 1);
      return f || m;
    });
    return text.replace(new RegExp(W, 'gu'), (w, off, all) => {
      const p = plain(w);
      if (exact.has(p)) return exact.get(p);                              // (a)
      if (!/^\p{Lu}/u.test(w)) return w;
      const before = all.slice(0, off);
      if (!before.trim() || /[.!?¿¡\n:]\s*$/.test(before)) return w;       // inicio de frase: la mayúscula no indica nombre
      return best(w) || w;                                               // (b)
    });
  }

  const STOP = {
    es: 'y los las del el muy pero también estoy está están estás gracias mañana hasta nos qué con una por para como cuando este esta eso ese tengo hola vale llego ya aquí ahora luego hoy porque mucho sí bueno vale vamos voy vas oye mira tranquilo llegaré abrazo besos saludos casa trabajo luego noche tarde',
    ca: 'i els les del molt però també estic està estàs gràcies demà fins ens què amb una per com quan aquest aquesta això tinc hola arribo ja aquí ara després avui perquè molt res mai sí bé d\'acord anem vaig vas escolta mira tranquil arribaré abraçada petons salutacions casa feina nit tarda',
    en: 'the and to of you is it that for on with are this be have at not but we they your my me so do can will just what i am i\'m i\'ll hi hello thanks see tomorrow be there here now today please yes no ok will just got home work tonight later love see thanks call',
    fr: 'le la les et des un une est je tu il nous vous que qui pas pour dans sur avec ce cette mais très bonjour merci au aux du suis demain ici maintenant aujourd\'hui c\'est j\'ai à ça va oui non bien merci salut bisous arrive vais ce soir chez moi toi maison travail ce',
    it: 'il lo gli e di che è un una per non con mi ti sono sei ciao grazie domani anche perché molto questo questa ma ho hai qui adesso oggi sì no va bene arrivo vado casa lavoro sera stasera baci abbraccio ci vediamo',
    de: 'der die das und ist ich du nicht ein eine zu mit sie es wir ihr den dem auf für sind bin hallo danke morgen auch aber sehr hier jetzt heute ja nein gut komme gehe zuhause hause arbeit abend heute bis grüße',
    pt: 'o os e de que é um uma para não com eu você ele ela nós muito mas também obrigado obrigada amanhã olá estou está são do da dos das em no na aqui agora hoje sim não bem chego vou casa trabalho noite logo beijos abraço até às começo',
  };
  const STOPSET = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));
  function detectLang(text) {
    const words = String(text || '').toLowerCase().match(/[\p{L}'’]+/gu) || [];
    if (words.length < 2) return null;
    const score = {};
    for (const [k, set] of Object.entries(STOPSET)) score[k] = words.reduce((n, w) => n + (set.has(w.replace('’', "'")) ? 1 : 0), 0);
    // pistas ortográficas muy claras
    const t = String(text).toLowerCase();
    const has = (w) => new RegExp('(^|[^\\p{L}])(' + w + ')(?![\\p{L}])', 'u').test(t);   // palabra suelta (con tildes)
    if (/l·l|ò|ï/.test(t) || has('els|amb|però|perquè|demà|també|molt')) score.ca += 2;
    if (/ê|œ/.test(t) || has("ça|j'\\p{L}+|c'est|qu'\\p{L}+|n'\\p{L}+|être|très")) score.fr += 2;
    if (/ñ|¿|¡/.test(t)) score.es += 2;
    if (/ç(?=[aou])/.test(t) && /\b(je|tu|nous|vous|est)\b/.test(t)) score.fr += 1;
    if (/ã|õ/.test(t)) score.pt += 2;
    if (/ß|ä|ö|ü/.test(t)) score.de += 2;
    const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
    // fiable: 2 o más palabras típicas y más que el segundo; o 1 sola si ningún otro idioma suma nada y hay varias palabras
    if (best[0][1] === best[1][1]) return null;
    if (best[0][1] < 2 && !(best[0][1] === 1 && best[1][1] === 0 && words.length >= 3)) return null;
    return best[0][0];
  }

  root.DictadoFormat = { formatMessage, placeQuestionMark, fixVocab, detectLang };
  if (typeof module !== 'undefined') module.exports = root.DictadoFormat;
})(typeof window !== 'undefined' ? window : globalThis);
