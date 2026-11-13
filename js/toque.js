// Controles na tela para celular e tablet: um direcional e botões que "apertam" teclas no Ruffle.
// O que mostrar vem do texto de controles do catálogo do CD (ex.: "Teclado – Setas: movem; Espaço: atira").

const TECLAS = {
  cima: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  baixo: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  esquerda: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  direita: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  espaco: { key: " ", code: "Space", keyCode: 32, rotulo: "Espaço" },
  enter: { key: "Enter", code: "Enter", keyCode: 13, rotulo: "Enter" },
  ctrl: { key: "Control", code: "ControlLeft", keyCode: 17, rotulo: "Ctrl" },
  shift: { key: "Shift", code: "ShiftLeft", keyCode: 16, rotulo: "Shift" },
  tab: { key: "Tab", code: "Tab", keyCode: 9, rotulo: "Tab" },
  alt: { key: "Alt", code: "AltLeft", keyCode: 18, rotulo: "Alt" },
};
const letra = (l) => ({ key: l.toLowerCase(), code: `Key${l}`, keyCode: l.charCodeAt(0), rotulo: l });
const digito = (d) => ({ key: d, code: `Digit${d}`, keyCode: 48 + +d, rotulo: d });
const WASD = { W: "cima", A: "esquerda", S: "baixo", D: "direita" };

function nomeParaTecla(nome) {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (/^setas?(\s|$)|direcion/.test(n)) return "setas";
  if (/espaco/.test(n)) return "espaco";
  if (/^enter|^return/.test(n)) return "enter";
  if (/^ctrl|^control/.test(n)) return "ctrl";
  if (/^shift/.test(n)) return "shift";
  if (/^tab$/.test(n)) return "tab";
  if (/^alt$/.test(n)) return "alt";
  if (/^[a-z]$/.test(n)) return n.toUpperCase();
  if (/^\d$/.test(n)) return n;
  return null;
}

// Devolve { teclado, direcional: "setas" | "wasd" | null, botoes: [tecla…] } ou null se não der para saber.
export function analisarControles(texto) {
  if (!texto) return null;
  const nomes = [];
  for (const trecho of texto.split(/[;\n]|\.\s/)) {
    const antes = trecho.includes(":") ? trecho.slice(0, trecho.indexOf(":")) : trecho;
    // "Teclado – Setas", "Mouse – Botão esquerdo", "Z, X", "W, A, S e D"
    const limpo = antes.replace(/^\s*(teclado|mouse)\s*[–-]\s*/i, "");
    if (/mouse|bot[aã]o|clique|clicar/i.test(antes) && !/teclado/i.test(antes)) continue;
    for (const parte of limpo.split(/,|\/|\s+e\s+|\s+ou\s+|\+/)) {
      const t = nomeParaTecla(parte);
      if (t) nomes.push(t);
    }
  }
  const teclado = /teclado|setas|espa[cç]o|\bctrl\b|\bshift\b|\benter\b/i.test(texto) || nomes.length > 0;
  if (!teclado) return { teclado: false, direcional: null, botoes: [] };

  let direcional = nomes.includes("setas") ? "setas" : null;
  const letrasWasd = ["W", "A", "S", "D"].filter((l) => nomes.includes(l));
  if (!direcional && letrasWasd.length >= 3) direcional = "wasd";
  const botoes = [];
  for (const n of nomes) {
    if (n === "setas" || (direcional === "wasd" && WASD[n])) continue;
    const t = TECLAS[n] || (/^[A-Z]$/.test(n) ? letra(n) : /^\d$/.test(n) ? digito(n) : null);
    if (t && !botoes.some((b) => b.code === t.code)) botoes.push(t);
  }
  if (!direcional && !botoes.length) { direcional = "setas"; botoes.push(TECLAS.espaco); }
  return { teclado: true, direcional, botoes: botoes.slice(0, 4) };
}

// Controles genéricos para quando o jogo não tem descrição (ex.: aberto pelo explorador).
export const CONTROLES_PADRAO = { teclado: true, direcional: "setas", botoes: [TECLAS.espaco, TECLAS.enter] };

export const telaDeToque = () => matchMedia("(pointer: coarse)").matches;

function enviar(alvo, tipo, t) {
  const el = alvo();
  if (!el) return;
  el.dispatchEvent(new KeyboardEvent(tipo, { key: t.key, code: t.code, keyCode: t.keyCode, which: t.keyCode, bubbles: true, cancelable: true }));
}

// Monta os controles dentro de `caixa`. `alvo()` devolve o elemento do player na hora do toque.
export function montarControles(caixa, analise, alvo) {
  const dirs = analise.direcional === "wasd"
    ? { cima: letra("W"), baixo: letra("S"), esquerda: letra("A"), direita: letra("D") }
    : { cima: TECLAS.cima, baixo: TECLAS.baixo, esquerda: TECLAS.esquerda, direita: TECLAS.direita };

  caixa.innerHTML = `
    ${analise.direcional ? `<div class="dpad" aria-label="Direcional"><span class="seta s-cima"></span><span class="seta s-baixo"></span><span class="seta s-esquerda"></span><span class="seta s-direita"></span><span class="dpad-centro"></span></div>` : "<span></span>"}
    <div class="toque-botoes">${analise.botoes.map((b, i) => `<button type="button" class="toque-bt" data-i="${i}">${b.rotulo || b.key}</button>`).join("")}</div>`;

  const segurar = (el) => {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  };

  // direcional: arrastar o dedo escolhe até duas direções (diagonais)
  const dpad = caixa.querySelector(".dpad");
  if (dpad) {
    segurar(dpad);
    let ativas = new Set();
    const aplicar = (novas) => {
      for (const d of ativas) if (!novas.has(d)) enviar(alvo, "keyup", dirs[d]);
      for (const d of novas) if (!ativas.has(d)) enviar(alvo, "keydown", dirs[d]);
      ativas = novas;
      for (const d of ["cima", "baixo", "esquerda", "direita"]) dpad.classList.toggle(`em-${d}`, ativas.has(d));
    };
    const mover = (e) => {
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const novas = new Set();
      if (Math.hypot(dx, dy) > r.width * 0.14) {
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = direita, 90 = baixo
        if (ang > -67.5 && ang < 67.5) novas.add("direita");
        if (ang > 112.5 || ang < -112.5) novas.add("esquerda");
        if (ang > 22.5 && ang < 157.5) novas.add("baixo");
        if (ang < -22.5 && ang > -157.5) novas.add("cima");
      }
      aplicar(novas);
    };
    dpad.addEventListener("pointerdown", (e) => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); mover(e); });
    dpad.addEventListener("pointermove", (e) => { if (dpad.hasPointerCapture(e.pointerId)) mover(e); });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) dpad.addEventListener(ev, () => aplicar(new Set()));
  }

  caixa.querySelectorAll(".toque-bt").forEach((bt) => {
    const t = analise.botoes[+bt.dataset.i];
    segurar(bt);
    let apertado = false;
    const soltar = () => { if (apertado) { apertado = false; bt.classList.remove("apertado"); enviar(alvo, "keyup", t); } };
    bt.addEventListener("pointerdown", (e) => {
      e.preventDefault(); // não tira o foco do jogo
      bt.setPointerCapture(e.pointerId);
      apertado = true; bt.classList.add("apertado");
      navigator.vibrate?.(8);
      enviar(alvo, "keydown", t);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) bt.addEventListener(ev, soltar);
  });
}
