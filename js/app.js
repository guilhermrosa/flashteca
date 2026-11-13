// Flashteca — roteamento por hash, estante de discos, menu de disco, player e explorador do archive.org.
import { carregarListagem, caminhoNoArchive, urlArquivo, buscarItens, metadadosItem, CONTEINERES } from "./archive.js";
import { catalogoComCache, catalogoSalvo, detectarFormato, resolverPagina, acharNaImagem } from "./catalogo.js";

const app = document.getElementById("app");
const trilha = document.getElementById("trilha");
// Repositório do site no GitHub (para publicar discos na estante pública via issue).
const REPO = location.hostname.endsWith(".github.io")
  ? `${location.hostname.split(".")[0]}/${location.pathname.split("/")[1] || location.hostname}`
  : "guilhermrosa/flashteca";

let listaSite = null;
const discosDoSite = () => (listaSite ??= fetch("data/discos.json").then((r) => r.json()).catch(() => []));
const cacheDiscos = new Map();

// ---------- armazenamento local (favoritos e recentes) ----------
const guardar = {
  ler(chave, padrao) {
    try { return JSON.parse(localStorage.getItem("flashteca:" + chave)) ?? padrao; } catch { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem("flashteca:" + chave, JSON.stringify(valor)); } catch { /* sem storage, segue sem */ }
  },
};
const chaveJogo = (disco, arquivo) => `${disco}|${arquivo}`;
function favoritos() { return new Set(guardar.ler("favoritos", [])); }
function alternarFavorito(chave) {
  const f = favoritos();
  f.has(chave) ? f.delete(chave) : f.add(chave);
  guardar.gravar("favoritos", [...f]);
  return f.has(chave);
}
function registrarRecente(entrada) {
  const r = guardar.ler("recentes", []).filter((e) => e.chave !== entrada.chave);
  r.unshift(entrada);
  guardar.gravar("recentes", r.slice(0, 24));
}

// ---------- utilitários ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tamanho = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; };

// ---------- discos: estante do site + estante do navegador ----------
const minhaEstante = () => guardar.ler("estante", []);
async function entradaDisco(id) {
  const site = await discosDoSite();
  const noSite = site.find((d) => d.id === id || d.item === id);
  if (noSite) return { ...noSite, origem: "site" };
  const local = minhaEstante().find((d) => d.id === id || d.item === id);
  if (local) return { ...local, origem: "local" };
  return { id, item: id, origem: "avulso" }; // qualquer item do archive.org com menu reconhecível
}
function alternarMinhaEstante(d) {
  const lista = minhaEstante().filter((x) => x.item !== d.item);
  const entrou = lista.length === minhaEstante().length;
  if (entrou) lista.push({ id: d.item, titulo: d.titulo, ano: d.ano, item: d.item, iso: d.iso });
  guardar.gravar("estante", lista);
  return entrou;
}
async function disco(id, progresso) {
  if (!cacheDiscos.has(id)) {
    cacheDiscos.set(id, (async () => {
      const e = await entradaDisco(id);
      const cat = await catalogoComCache(e.item, { conteiner: e.iso, progresso });
      return { ...cat, id: e.id, titulo: e.titulo || cat.titulo, ano: e.ano ?? cat.ano, origem: e.origem };
    })().catch((err) => { cacheDiscos.delete(id); throw err; }));
  }
  return cacheDiscos.get(id);
}
function carregando(msg) {
  let el = app.querySelector(".carregando-disco");
  if (!el) app.replaceChildren(h(`<p class="carregando carregando-disco"></p>`)), (el = app.querySelector(".carregando-disco"));
  el.textContent = msg;
}
function linkPublicar(d) {
  const entrada = { id: d.item, titulo: d.titulo, ano: d.ano, item: d.item, iso: d.iso };
  const corpo = `Disco para adicionar à estante pública da Flashteca (pode ajustar o título antes de enviar).\n\n\`\`\`json\n${JSON.stringify(entrada, null, 1)}\n\`\`\`\n`;
  return `https://github.com/${REPO}/issues/new?` + new URLSearchParams({ title: `[estante] ${d.titulo}`, body: corpo });
}
function todosJogos(d) {
  return d.categorias.flatMap((c) => c.jogos.map((j) => ({ ...j, categoria: c.nome, categoriaId: c.id })));
}

// ---------- player Ruffle ----------
let playerAtual = null;
function pararPlayer() {
  if (playerAtual) { try { playerAtual.remove(); } catch {} playerAtual = null; }
}
function montarPlayer(alvo, url) {
  pararPlayer();
  const ruffle = window.RufflePlayer?.newest();
  if (!ruffle) {
    alvo.replaceChildren(h(`<div class="aviso">Não foi possível carregar o Ruffle. Verifique sua conexão e recarregue a página.</div>`));
    return;
  }
  const player = ruffle.createPlayer();
  player.className = "ruffle";
  alvo.replaceChildren(player);
  playerAtual = player;
  const base = url.slice(0, url.lastIndexOf("/") + 1);
  player.ruffle().load({
    url,
    base, // arquivos auxiliares (XML, outros SWF) são buscados relativos à pasta do jogo
    autoplay: "on",
    unmuteOverlay: "hidden",
    letterbox: "on",
    allowScriptAccess: false,
    openUrlMode: "confirm",
    splashScreen: true,
  }).catch((e) => console.warn("Ruffle:", e));
  player.addEventListener("loadedmetadata", () => {
    const m = player.metadata;
    if (m?.width && m?.height) alvo.style.aspectRatio = `${m.width} / ${m.height}`;
    player.focus?.();
  }, { once: true });
}

function telaCheia(el) {
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen?.().catch(() => {});
}

// ---------- telas ----------
function cartaoDisco(d) {
  const cat = catalogoSalvo(d.item);
  const n = cat && cat.categorias.reduce((t, c) => t + c.jogos.length, 0);
  return `
    <a class="disco-card" href="#/disco/${encodeURIComponent(d.id)}">
      <img src="https://archive.org/services/img/${esc(d.item)}" alt="" loading="lazy">
      <div>
        <strong>${esc(d.titulo || d.item)}</strong>
        <span>${[d.ano, n && `${n} jogos`, cat && `${cat.categorias.length} categorias`].filter(Boolean).join(" · ") || "Abrir disco"}</span>
      </div>
    </a>`;
}

async function telaEstante() {
  const discos = await discosDoSite();
  const meus = minhaEstante().filter((m) => !discos.some((d) => d.item === m.item));
  const recentes = guardar.ler("recentes", []);
  app.replaceChildren(h(`
    <section class="intro">
      <h1>Os CDs de jogos da infância,<br>de volta ao navegador.</h1>
      <p>Coletâneas de jogos em Flash que vinham em revistas e bancas, preservadas no Internet Archive.
      Escolha um disco da estante ou explore o acervo atrás de outros.</p>
    </section>
    <section>
      <h2 class="secao">Estante</h2>
      <div class="estante">
        ${discos.map(cartaoDisco).join("")}
        <a class="disco-card disco-vazio" href="#/explorar">
          <div class="disco-mais" aria-hidden="true">+</div>
          <div><strong>Procurar outro disco</strong><span>Busque no Internet Archive e abra qualquer CD com Flash dentro</span></div>
        </a>
      </div>
    </section>
    ${meus.length ? `
    <section>
      <h2 class="secao">Minha estante</h2>
      <p class="dica">Discos que você adicionou neste navegador.</p>
      <div class="estante">${meus.map(cartaoDisco).join("")}</div>
    </section>` : ""}
    ${recentes.length ? `
    <section>
      <h2 class="secao">Jogados recentemente</h2>
      <div class="grade grade-compacta">
        ${recentes.slice(0, 12).map((r) => `
          <a class="jogo" href="${esc(r.link)}">
            ${r.imagem ? `<img src="${esc(r.imagem)}" alt="" loading="lazy">` : `<div class="sem-capa">SWF</div>`}
            <span class="jogo-nome">${esc(r.nome)}</span>
            <span class="jogo-cat">${esc(r.origem)}</span>
          </a>`).join("")}
      </div>
    </section>` : ""}
  `));
}

// filtro do menu do disco fica entre navegações (ex.: voltar do jogo para a lista)
const estadoDisco = { categoria: "todos", busca: "", mostrarOff: false };

async function telaDisco(id) {
  const d = await disco(id, carregando);
  const jogos = todosJogos(d);
  const base = (p) => urlArquivo(d.item, d.iso, p);

  app.replaceChildren(h(`
    <section class="disco-topo">
      <img class="disco-capa" src="https://archive.org/services/img/${esc(d.item)}" alt="Capa do DVD">
      <div>
        <h1>${esc(d.titulo)}</h1>
        <p>${d.ano ? d.ano + " · " : ""}${jogos.length} jogos</p>
        <div class="acoes">
          ${d.trilha ? `<button class="botao" id="bt-trilha" type="button">♪ Trilha do menu</button>` : ""}
          ${d.revista ? `<a class="botao" href="${base(d.revista)}" target="_blank" rel="noopener">Revista (PDF)</a>` : ""}
          <a class="botao" href="#/item/${encodeURIComponent(d.item)}">Ver todos os arquivos</a>
          <a class="botao" href="https://archive.org/details/${esc(d.item)}" target="_blank" rel="noopener">No archive.org ↗</a>
        </div>
        ${d.origem !== "site" ? `
        <div class="acoes">
          <button class="botao botao-forte" id="bt-estante" type="button"></button>
          <a class="botao" href="${esc(linkPublicar(d))}" target="_blank" rel="noopener" title="Abre uma issue no GitHub; a Action do repositório adiciona o disco">Publicar na estante do site ↗</a>
        </div>` : ""}
      </div>
    </section>
    <section class="filtros">
      <div class="chips" role="tablist"></div>
      <div class="linha-busca">
        <input class="busca" type="search" placeholder="Buscar jogo…" aria-label="Buscar jogo">
        ${jogos.some((j) => !jogavel(j)) ? `<label class="opcao"><input type="checkbox" id="mostrar-off"> Mostrar os ${jogos.filter((j) => !jogavel(j)).length} que não rodam no navegador</label>` : ""}
      </div>
    </section>
    <p class="contagem" aria-live="polite"></p>
    <div class="grade"></div>
  `));

  const chips = app.querySelector(".chips");
  const busca = app.querySelector(".busca");
  const grade = app.querySelector(".grade");
  const contagem = app.querySelector(".contagem");
  busca.value = estadoDisco.busca;

  const opcoes = [
    { id: "todos", nome: "Todos" },
    ...d.categorias.map((c) => ({ id: c.id, nome: c.nome })),
    { id: "favoritos", nome: "★ Favoritos" },
  ];

  function desenhar() {
    const fav = favoritos();
    const termo = semAcento(estadoDisco.busca.trim());
    const visiveis = estadoDisco.mostrarOff ? jogos : jogos.filter(jogavel);
    let lista = visiveis;
    if (estadoDisco.categoria === "favoritos") lista = lista.filter((j) => fav.has(chaveJogo(id, j.arquivo)));
    else if (estadoDisco.categoria !== "todos") lista = lista.filter((j) => j.categoriaId === estadoDisco.categoria);
    if (termo) lista = lista.filter((j) => semAcento(j.nome + " " + j.descricao).includes(termo));

    chips.innerHTML = opcoes.map((o) => {
      const n = o.id === "todos" ? visiveis.length
        : o.id === "favoritos" ? visiveis.filter((j) => fav.has(chaveJogo(id, j.arquivo))).length
        : visiveis.filter((j) => j.categoriaId === o.id).length;
      return `<button type="button" role="tab" class="chip" data-cat="${o.id}" aria-selected="${o.id === estadoDisco.categoria}">${esc(o.nome)} <small>${n}</small></button>`;
    }).join("");
    contagem.textContent = lista.length === 1 ? "1 jogo" : `${lista.length} jogos`;
    grade.innerHTML = lista.length ? lista.map((j) => `
      <a class="jogo${jogavel(j) ? "" : " jogo-off"}" href="#/disco/${encodeURIComponent(id)}/jogar/${encodeURIComponent(j.arquivo)}" title="${esc(j.descricao)}">
        ${j.imagem ? `<img src="${base(j.imagem)}" alt="" loading="lazy">` : `<div class="sem-capa">${esc(j.nome.slice(0, 2))}</div>`}
        ${fav.has(chaveJogo(id, j.arquivo)) ? `<span class="selo-fav" aria-label="favorito">★</span>` : ""}
        ${jogavel(j) ? "" : `<span class="selo">${j.tipo === "windows" ? "Windows/DOS" : "Shockwave"}</span>`}
        <span class="jogo-nome">${esc(j.nome)}</span>
        <span class="jogo-cat">${esc(j.categoria)}</span>
      </a>`).join("")
      : `<div class="aviso">${estadoDisco.categoria === "favoritos" && !termo ? "Nenhum favorito ainda. Abra um jogo e toque em ☆ para guardar aqui." : "Nenhum jogo encontrado."}</div>`;
  }

  chips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    estadoDisco.categoria = b.dataset.cat;
    desenhar();
  });
  busca.addEventListener("input", () => { estadoDisco.busca = busca.value; desenhar(); });
  const off = app.querySelector("#mostrar-off");
  if (off) {
    off.checked = estadoDisco.mostrarOff;
    off.addEventListener("change", () => { estadoDisco.mostrarOff = off.checked; desenhar(); });
  }
  if (d.trilha) ligarTrilha(app.querySelector("#bt-trilha"), base(d.trilha));
  const btEstante = app.querySelector("#bt-estante");
  if (btEstante) {
    const rotulo = () => (btEstante.textContent = minhaEstante().some((x) => x.item === d.item) ? "✓ Na minha estante (remover)" : "＋ Adicionar à minha estante");
    btEstante.addEventListener("click", () => { alternarMinhaEstante(d); rotulo(); });
    rotulo();
  }
  desenhar();
}
const jogavel = (j) => j.tipo === "swf" || j.tipo === "pagina";

function ligarTrilha(botao, url) {
  const atualizar = () => {
    const tocando = !trilha.paused && trilha.src === url;
    botao.textContent = tocando ? "❚❚ Pausar trilha" : "♪ Trilha do menu";
    botao.setAttribute("aria-pressed", tocando);
  };
  botao.addEventListener("click", () => {
    if (trilha.src !== url) trilha.src = url;
    trilha.paused ? trilha.play().catch(() => {}) : trilha.pause();
  });
  trilha.onplay = trilha.onpause = atualizar;
  atualizar();
}

async function telaJogoDisco(id, arquivo) {
  const d = await disco(id, carregando);
  const jogos = todosJogos(d);
  const i = jogos.findIndex((j) => j.arquivo === arquivo);
  if (i < 0) return telaErro("Jogo não encontrado neste disco.");
  const j = jogos[i];
  const chave = chaveJogo(id, j.arquivo);
  const imagem = j.imagem ? urlArquivo(d.item, d.iso, j.imagem) : null;
  trilha.pause();

  // jogos que o CD abria por uma página HTML: descobre o SWF embutido nela
  let alvo = { caminho: j.arquivo, tipo: j.tipo };
  if (j.tipo === "pagina") {
    carregando("Abrindo a página do jogo…");
    const achar = await acharNaImagem(d.item, d.iso);
    alvo = (await resolverPagina(d.item, d.iso, j.arquivo, achar)) || { caminho: j.arquivo, tipo: "sem-flash" };
  }
  const url = urlArquivo(d.item, d.iso, alvo.caminho);
  const link = (k) => `#/disco/${encodeURIComponent(id)}/jogar/${encodeURIComponent(jogos[k].arquivo)}`;

  const controles = j.controles.split(";").map((c) => c.trim()).filter(Boolean);
  telaPlayer({
    voltar: { href: `#/disco/${encodeURIComponent(id)}`, texto: d.titulo },
    nome: j.nome,
    sub: j.categoria,
    descricao: j.descricao,
    controles,
    url,
    chave,
    incompativel: alvo.tipo === "swf" ? null : alvo.tipo,
    anterior: i > 0 ? link(i - 1) : null,
    proximo: i < jogos.length - 1 ? link(i + 1) : null,
  });
  registrarRecente({ chave, nome: j.nome, origem: d.titulo, imagem, link: location.hash });
}

function telaPlayer(o) {
  const fav = favoritos().has(o.chave);
  app.replaceChildren(h(`
    <a class="voltar" href="${o.voltar.href}">← ${esc(o.voltar.texto)}</a>
    <section class="tela-jogo">
      <div class="palco" id="palco"></div>
      <aside class="ficha">
        <p class="ficha-cat">${esc(o.sub || "")}</p>
        <h1>${esc(o.nome)}</h1>
        ${o.descricao ? `<p>${esc(o.descricao)}</p>` : ""}
        ${o.controles?.length ? `<h2>Controles</h2><ul class="controles">${o.controles.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
        <div class="acoes">
          <button class="botao botao-forte" id="bt-cheia" type="button">⛶ Tela cheia</button>
          <button class="botao" id="bt-fav" type="button" aria-pressed="${fav}">${fav ? "★ Favorito" : "☆ Favoritar"}</button>
          <button class="botao" id="bt-reiniciar" type="button">↻ Reiniciar</button>
          <a class="botao" href="${esc(o.url)}" download>Baixar arquivo</a>
        </div>
        <div class="acoes navegar">
          ${o.anterior ? `<a class="botao" href="${o.anterior}">← Anterior</a>` : ""}
          ${o.proximo ? `<a class="botao" href="${o.proximo}">Próximo →</a>` : ""}
        </div>
        <p class="dica">Clique no jogo para ele receber o teclado. Se algo não funcionar, é limitação do emulador com aquele jogo específico.</p>
      </aside>
    </section>
  `));
  const palco = app.querySelector("#palco");
  if (o.incompativel === "windows") {
    palco.replaceChildren(h(`<div class="aviso">Este é um <strong>programa de Windows ou DOS</strong> (.exe/.com), não um jogo em Flash, então não roda no navegador.
      Dá para baixar e abrir no Windows, no Wine ou no DOSBox.</div>`));
  } else if (o.incompativel === "sem-flash") {
    palco.replaceChildren(h(`<div class="aviso">A página deste jogo não embute um arquivo Flash que a Flashteca encontre (pode ser um jogo em Java ou em outro formato).</div>`));
  } else if (o.incompativel) {
    palco.replaceChildren(h(`<div class="aviso">Este jogo é <strong>Shockwave</strong> (Adobe Director), um formato diferente do Flash que o Ruffle ainda não roda.
      Dá para baixar o arquivo e abrir num PC antigo ou máquina virtual com o Shockwave Player.</div>`));
  } else {
    montarPlayer(palco, o.url);
  }
  app.querySelector("#bt-cheia").addEventListener("click", () => telaCheia(palco));
  app.querySelector("#bt-reiniciar").addEventListener("click", () => !o.incompativel && montarPlayer(palco, o.url));
  app.querySelector("#bt-fav").addEventListener("click", (e) => {
    const agora = alternarFavorito(o.chave);
    e.currentTarget.textContent = agora ? "★ Favorito" : "☆ Favoritar";
    e.currentTarget.setAttribute("aria-pressed", agora);
  });
}

// ---------- explorador do archive.org ----------
const estadoBusca = { termo: "", resultados: null };

function telaExplorar() {
  app.replaceChildren(h(`
    <section class="intro">
      <h1>Explorar o Internet Archive</h1>
      <p>Busque CDs e DVDs de software, ou cole o link de um item do archive.org.
      A Flashteca abre as imagens de disco (ISO, ZIP…) e lista os arquivos Flash que tiver dentro para jogar.</p>
    </section>
    <form class="form-busca">
      <input class="busca" name="q" type="search" placeholder="ex.: jogos flash, coletânea, revista cd-rom… ou um link archive.org/details/…" aria-label="Buscar ou colar link">
      <button class="botao botao-forte" type="submit">Buscar</button>
    </form>
    <div class="sugestoes">Sugestões:
      ${["jogos flash", "450 jogos", "flash games collection", "coverdisc games", "cd-rom revista jogos"].map((s) => `<button type="button" class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join("")}
    </div>
    <div id="resultados"></div>
  `));
  const form = app.querySelector("form");
  const campo = form.q;
  const area = app.querySelector("#resultados");
  campo.value = estadoBusca.termo;

  async function buscar(termo) {
    estadoBusca.termo = termo;
    const id = termo.match(/archive\.org\/(?:details|download)\/([^/?#\s]+)/)?.[1];
    if (id) { location.hash = `#/item/${id}`; return; }
    if (!termo.trim()) return;
    area.innerHTML = `<p class="carregando">Buscando…</p>`;
    try {
      estadoBusca.resultados = await buscarItens(termo);
      desenhar();
    } catch (e) {
      area.innerHTML = `<div class="aviso">Falha na busca: ${esc(e.message)}</div>`;
    }
  }
  function desenhar() {
    const r = estadoBusca.resultados;
    if (!r) return;
    area.innerHTML = r.length ? `<div class="lista-itens">${r.map((it) => `
      <a class="item" href="#/item/${encodeURIComponent(it.identifier)}">
        <img src="https://archive.org/services/img/${esc(it.identifier)}" alt="" loading="lazy">
        <div><strong>${esc(it.title || it.identifier)}</strong><span>${esc([it.year || it.date?.slice(0, 4), it.creator].flat().filter(Boolean).join(" · "))}</span></div>
      </a>`).join("")}</div>` : `<div class="aviso">Nada encontrado.</div>`;
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); buscar(campo.value); });
  app.querySelector(".sugestoes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-q]");
    if (b) { campo.value = b.dataset.q; buscar(b.dataset.q); }
  });
  desenhar();
}

async function telaItem(id) {
  app.replaceChildren(h(`<p class="carregando">Abrindo item do archive.org…</p>`));
  const meta = await metadadosItem(id);
  const titulo = [meta.metadata?.title].flat()[0] || id;
  const arquivos = meta.files || [];
  const conteineres = arquivos.filter((f) => CONTEINERES.test(f.name));
  const soltos = arquivos.filter((f) => /\.swf$/i.test(f.name));

  app.replaceChildren(h(`
    <a class="voltar" href="#/explorar">← Explorar</a>
    <section class="disco-topo">
      <img class="disco-capa" src="https://archive.org/services/img/${esc(id)}" alt="">
      <div>
        <h1>${esc(titulo)}</h1>
        <p>${esc([meta.metadata?.date, [meta.metadata?.creator].flat()[0]].filter(Boolean).join(" · "))}</p>
        <div class="acoes"><a class="botao" href="https://archive.org/details/${esc(id)}" target="_blank" rel="noopener">No archive.org ↗</a></div>
      </div>
    </section>
    <input class="busca" type="search" placeholder="Filtrar arquivos…" aria-label="Filtrar arquivos" hidden>
    <div id="conteudo"></div>
  `));
  const area = app.querySelector("#conteudo");
  const filtro = app.querySelector(".busca");

  if (!conteineres.length && !soltos.length) {
    area.innerHTML = `<div class="aviso">Este item não tem imagens de disco nem arquivos .swf que a Flashteca saiba abrir.</div>`;
    return;
  }
  area.innerHTML = `<p class="carregando">Lendo ${conteineres.length} imagem(ns) de disco…</p>`;

  const grupos = [];
  if (soltos.length) grupos.push({ nome: "Arquivos soltos no item", conteiner: "", swfs: soltos.map((f) => ({ caminho: f.name, tamanho: +f.size })) });
  for (const c of conteineres) {
    try {
      const lista = await carregarListagem(meta, c.name);
      grupos.push({ nome: c.name, conteiner: c.name, formato: detectarFormato(lista), swfs: lista.filter((f) => /\.swf$/i.test(f.caminho)), dcr: lista.filter((f) => /\.dcr$/i.test(f.caminho)).length });
    } catch (e) {
      grupos.push({ nome: c.name, conteiner: c.name, erro: e.message, swfs: [] });
    }
  }
  const total = grupos.reduce((n, g) => n + g.swfs.length, 0);
  filtro.hidden = total < 12;
  const comMenu = grupos.find((g) => g.formato);
  if (comMenu) {
    app.querySelector(".disco-topo").after(h(`
      <div class="banner-menu">
        <div><strong>Este disco tem o menu original.</strong>
        <span>Dá para abrir com capas, categorias e descrições, e guardar na sua estante.</span></div>
        <a class="botao botao-forte" href="#/disco/${encodeURIComponent(id)}">Abrir com o menu do disco</a>
      </div>`));
  }

  function desenhar() {
    const termo = semAcento(filtro.value.trim());
    area.innerHTML = `<p class="contagem">${total} arquivo(s) Flash encontrados</p>` + grupos.map((g) => {
      const swfs = termo ? g.swfs.filter((f) => semAcento(f.caminho).includes(termo)) : g.swfs;
      return `
      <section class="grupo">
        <h2 class="secao">${esc(g.nome)}</h2>
        ${g.erro ? `<div class="aviso">Não foi possível listar: ${esc(g.erro)}</div>` : ""}
        ${!g.erro && !g.swfs.length ? `<p class="dica">Nenhum .swf aqui${g.dcr ? ` (há ${g.dcr} arquivo(s) Shockwave .dcr, ainda não suportados)` : ""}.</p>` : ""}
        <ul class="arquivos">${swfs.slice(0, 600).map((f) => `
          <li><a href="#/item/${encodeURIComponent(id)}/jogar/${encodeURIComponent(g.conteiner)}/${encodeURIComponent(f.caminho)}">
            <span>${esc(f.caminho)}</span><small>${f.tamanho ? tamanho(f.tamanho) : ""}</small></a></li>`).join("")}
        </ul>
        ${swfs.length > 600 ? `<p class="dica">Mostrando 600 de ${swfs.length}. Use o filtro.</p>` : ""}
      </section>`;
    }).join("");
  }
  filtro.addEventListener("input", desenhar);
  desenhar();
}

async function telaJogoItem(id, conteiner, caminho) {
  const url = conteiner ? urlArquivo(id, conteiner, caminho) : `https://archive.org/download/${caminhoNoArchive(id)}/${caminhoNoArchive(caminho)}`;
  const nome = caminho.split("/").pop().replace(/\.swf$/i, "");
  trilha.pause();
  telaPlayer({
    voltar: { href: `#/item/${encodeURIComponent(id)}`, texto: "Arquivos do item" },
    nome,
    sub: caminho,
    url,
    chave: chaveJogo(id, conteiner + "/" + caminho),
  });
  registrarRecente({ chave: chaveJogo(id, conteiner + "/" + caminho), nome, origem: id, imagem: null, link: location.hash });
}

function telaErro(msg) {
  app.replaceChildren(h(`<div class="aviso">${esc(msg)} <a href="#/">Voltar à estante</a></div>`));
}

// ---------- roteador ----------
async function rotear() {
  pararPlayer();
  const partes = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [rota, a, b, c, ...resto] = partes;
  document.querySelectorAll("[data-nav]").forEach((n) => n.toggleAttribute("aria-current",
    (n.dataset.nav === "explorar") === (rota === "explorar" || rota === "item")));
  try {
    if (!rota) await telaEstante();
    else if (rota === "disco" && b === "jogar") await telaJogoDisco(a, [c, ...resto].join("/"));
    else if (rota === "disco") await telaDisco(a);
    else if (rota === "explorar") telaExplorar();
    else if (rota === "item" && b === "jogar") await telaJogoItem(a, c, resto.join("/"));
    else if (rota === "item") await telaItem(a);
    else telaErro("Página não encontrada.");
  } catch (e) {
    console.error(e);
    telaErro("Algo deu errado: " + e.message);
  }
  if (!(rota === "disco" && !b)) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", rotear);
rotear();
