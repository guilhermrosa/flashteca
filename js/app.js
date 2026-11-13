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
const discosDoSite = () => (listaSite ??= fetch("data/discos.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => []));
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
  const n = cat && cat.categorias.reduce((t, c) => t + c.jogos.filter(jogavel).length, 0);
  return `
    <a class="disco-card" href="#/disco/${encodeURIComponent(d.id)}">
      <div class="capa"><img src="https://archive.org/services/img/${esc(d.item)}" alt="" loading="lazy"></div>
      <div class="info">
        <strong>${esc(d.titulo || d.item)}</strong>
        <span>${[d.ano, n && `${n} jogos`].filter(Boolean).join(" · ") || "Abrir disco"}</span>
      </div>
    </a>`;
}

async function telaEstante() {
  const discos = await discosDoSite();
  const meus = minhaEstante().filter((m) => !discos.some((d) => d.item === m.item));
  const recentes = guardar.ler("recentes", []);
  app.replaceChildren(h(`
    <section class="intro">
      <p class="sobre">Coletâneas de CD-ROM · Internet Archive</p>
      <h1>Os CDs de jogos da banca, <em>de volta ao navegador.</em></h1>
      <p>Aqueles discos com centenas de jogos em Flash que vinham com as revistas. Escolha um da estante,
      ou procure outros no acervo do Internet Archive.</p>
    </section>
    <section>
      <h2 class="secao">Estante</h2>
      <div class="estante">
        ${discos.map(cartaoDisco).join("")}
        <a class="disco-card disco-vazio" href="#/explorar">
          <div class="capa"><div class="disco-mais" aria-hidden="true">+</div></div>
          <div class="info"><strong>Procurar outro disco</strong><span>Abra qualquer CD do Internet Archive</span></div>
        </a>
      </div>
    </section>
    ${meus.length ? `
    <section>
      <h2 class="secao">Minha estante <small>discos que você guardou neste navegador</small></h2>
      <div class="estante">${meus.map(cartaoDisco).join("")}</div>
    </section>` : ""}
    ${recentes.length ? `
    <section>
      <h2 class="secao">Jogados recentemente</h2>
      <div class="grade-compacta">
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

// O menu do disco imita os menus dos CDs: tela inicial com as categorias e uma lista em tabela.
// O estado fica entre navegações (ex.: voltar do jogo para a lista em que se estava).
const estadoDisco = { id: null, tela: "menu", categoria: "todos", busca: "", selecionado: null, mostrarOff: false };
const jogavel = (j) => j.tipo === "swf" || j.tipo === "pagina";
const telaPequena = () => matchMedia("(max-width: 760px)").matches;
const temaDoDisco = (d) => d.tema || (/menin|girl|garota/i.test(d.titulo + d.item) ? "rosa" : "azul");

async function telaDisco(id) {
  const d = await disco(id, carregando);
  const jogos = todosJogos(d);
  const total = jogos.filter(jogavel).length;
  const base = (p) => urlArquivo(d.item, d.iso, p);
  if (estadoDisco.id !== id) Object.assign(estadoDisco, { id, tela: "menu", categoria: "todos", busca: "", selecionado: null, mostrarOff: false });
  const naoRodam = jogos.length - total;
  const minha = d.origem !== "site";

  app.replaceChildren(h(`
    <a class="voltar" href="#/">← Estante</a>
    <section class="cd tema-${temaDoDisco(d)}" aria-label="Menu do disco ${esc(d.titulo)}">
      <div class="cd-titulo">
        <img src="img/icone.svg" alt="">
        <strong>${esc(d.titulo)}</strong>
        <div class="cd-janela-botoes">
          <span aria-hidden="true">?</span><span aria-hidden="true">–</span>
          <a href="#/" aria-label="Fechar o disco e voltar à estante" title="Fechar">✕</a>
        </div>
      </div>
      <div class="cd-ferramentas">
        <form class="cd-busca" role="search">
          <label for="cd-q">BUSCA:</label>
          <input id="cd-q" name="q" type="search" autocomplete="off">
          <button class="cd-bt" type="submit" style="padding:0 6px">OK</button>
        </form>
        ${d.trilha ? `<button class="cd-ferramenta" id="bt-trilha" type="button"><span class="ico">♪</span><span class="rotulo"></span></button>` : ""}
        ${d.revista ? `<a class="cd-ferramenta" href="${base(d.revista)}" target="_blank" rel="noopener"><span class="ico">▤</span><span class="rotulo">Revista</span></a>` : ""}
        <a class="cd-ferramenta" href="#/item/${encodeURIComponent(d.item)}"><span class="ico">◎</span><span class="rotulo">Conteúdo do CD</span></a>
        <button class="cd-ferramenta cd-direita" id="bt-menu" type="button"><span class="ico">↩</span><span class="rotulo">Menu principal</span></button>
      </div>
      <div class="cd-corpo"></div>
      <div class="cd-status">
        <span>${total} jogos${d.ano ? ` · ${d.ano}` : ""} · lido direto do Internet Archive</span>
        <a href="https://archive.org/details/${esc(d.item)}" target="_blank" rel="noopener">ver no archive.org ↗</a>
      </div>
    </section>
    ${minha ? `
    <div class="acoes">
      <button class="botao botao-forte" id="bt-estante" type="button"></button>
      <a class="botao" href="${esc(linkPublicar(d))}" target="_blank" rel="noopener" title="Abre uma issue no GitHub; a Action do repositório adiciona o disco">Publicar na estante do site ↗</a>
    </div>` : ""}
  `));

  const corpo = app.querySelector(".cd-corpo");
  const ir = (mudanca) => { Object.assign(estadoDisco, mudanca); desenhar(); };

  function desenhar() {
    if (estadoDisco.tela === "menu") desenharMenu();
    else desenharLista();
  }

  function desenharMenu() {
    const cats = d.categorias.map((c) => ({ id: c.id, nome: c.nome, n: c.jogos.filter(jogavel).length }));
    const meio = Math.ceil(cats.length / 2);
    const botao = (c, extra = "") => `<button type="button" class="cd-cat ${extra}" data-cat="${c.id}">${esc(c.nome)} <small>${c.n}</small></button>`;
    const nFav = jogos.filter((j) => favoritos().has(chaveJogo(id, j.arquivo))).length;
    corpo.innerHTML = `
      <div class="cd-menu">
        <div class="cd-marca"><strong>${total}</strong><span>JOGOS</span><small>TODOS RODAM DIRETO DO NAVEGADOR</small></div>
        <div class="cd-cats">${cats.slice(0, meio).map((c) => botao(c)).join("")}</div>
        <div class="cd-capa"><img src="https://archive.org/services/img/${esc(d.item)}" alt="Foto do disco"></div>
        <div class="cd-cats direita">${cats.slice(meio).map((c) => botao(c)).join("")}
          ${botao({ id: "todos", nome: "Listar todos", n: total }, "cd-cat-especial")}
          ${nFav ? botao({ id: "favoritos", nome: "★ Favoritos", n: nFav }, "cd-cat-especial") : ""}
        </div>
      </div>`;
    corpo.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () =>
      ir({ tela: "lista", categoria: b.dataset.cat, busca: "", selecionado: null })));
  }

  function filtrar() {
    const fav = favoritos();
    const termo = semAcento(estadoDisco.busca.trim());
    let lista = estadoDisco.mostrarOff ? jogos : jogos.filter(jogavel);
    if (estadoDisco.categoria === "favoritos") lista = lista.filter((j) => fav.has(chaveJogo(id, j.arquivo)));
    else if (estadoDisco.categoria !== "todos") lista = lista.filter((j) => j.categoriaId === estadoDisco.categoria);
    if (termo) lista = lista.filter((j) => semAcento(j.nome + " " + j.descricao).includes(termo));
    return lista;
  }

  function desenharLista() {
    const cat = d.categorias.find((c) => c.id === estadoDisco.categoria);
    const titulo = estadoDisco.busca && estadoDisco.categoria === "todos" ? "Resultado da busca"
      : estadoDisco.categoria === "favoritos" ? "Favoritos" : cat ? cat.nome : "Todos os jogos";
    corpo.innerHTML = `
      <div class="cd-lista">
        <div class="cd-lista-topo">
          <span>Categoria - <b>${esc(titulo)}</b></span>
          <button type="button" id="cd-voltar">Voltar</button>
        </div>
        <div class="cd-lista-caixa">
          <form class="cd-pesquisa" role="search">
            <label for="cd-p">Pesquisar por :</label>
            <input id="cd-p" type="search" autocomplete="off">
            <button class="cd-bt" type="submit">Buscar</button>
            <button class="cd-bt" type="button" id="cd-todos">Listar Todos</button>
            ${naoRodam ? `<label class="cd-opcao"><input type="checkbox" id="cd-off"> mostrar os ${naoRodam} que não rodam</label>` : ""}
          </form>
          <div class="cd-lista-conteudo">
            <div class="cd-tabela" role="listbox" tabindex="0" aria-label="Jogos">
              <div class="cd-cab" aria-hidden="true"><span>Nº</span><span>Nome</span><span>Categoria</span><span>★</span></div>
              <div class="cd-linhas"></div>
            </div>
            <aside class="cd-detalhe" aria-live="polite"></aside>
          </div>
        </div>
      </div>`;

    const linhas = corpo.querySelector(".cd-linhas");
    const detalhe = corpo.querySelector(".cd-detalhe");
    const tabela = corpo.querySelector(".cd-tabela");
    const campo = corpo.querySelector("#cd-p");
    campo.value = estadoDisco.busca;
    const off = corpo.querySelector("#cd-off");
    if (off) off.checked = estadoDisco.mostrarOff;

    let lista = [];
    const linkJogo = (j) => `#/disco/${encodeURIComponent(id)}/jogar/${encodeURIComponent(j.arquivo)}`;

    function preencher() {
      lista = filtrar();
      const fav = favoritos();
      if (!lista.some((j) => j.arquivo === estadoDisco.selecionado)) estadoDisco.selecionado = lista[0]?.arquivo ?? null;
      linhas.innerHTML = lista.length ? lista.map((j, i) => `
        <div class="cd-linha${jogavel(j) ? "" : " off"}" role="option" id="cd-l${i}" data-i="${i}" aria-selected="${j.arquivo === estadoDisco.selecionado}">
          <span>${i + 1}</span><span>${esc(j.nome)}</span><span>${esc(j.categoria)}</span><span class="fav">${fav.has(chaveJogo(id, j.arquivo)) ? "★" : ""}</span>
        </div>`).join("")
        : `<div class="cd-vazio">${estadoDisco.categoria === "favoritos" ? "Nenhum favorito ainda." : "Nenhum jogo encontrado."}</div>`;
      mostrarDetalhe();
      linhas.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }

    function mostrarDetalhe() {
      const j = lista.find((x) => x.arquivo === estadoDisco.selecionado);
      if (!j) { detalhe.innerHTML = ""; return; }
      const sel = linhas.querySelector('[aria-selected="true"]');
      if (sel) tabela.setAttribute("aria-activedescendant", sel.id);
      const controles = j.controles.split(";").map((c) => c.trim()).filter(Boolean);
      const fav = favoritos().has(chaveJogo(id, j.arquivo));
      detalhe.innerHTML = `
        <div class="cd-detalhe-img">${j.imagem ? `<img src="${base(j.imagem)}" alt="">` : "sem imagem"}</div>
        <div class="cd-detalhe-info">
          <h3>${esc(j.nome)}</h3>
          ${j.descricao ? `<p>${esc(j.descricao)}</p>` : ""}
          ${controles.length ? `<h4>Controles</h4><ul>${controles.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
          ${jogavel(j) ? `<a class="cd-jogar" href="${linkJogo(j)}">▶ JOGAR</a>`
            : `<span class="cd-jogar desativado">${j.tipo === "windows" ? "Programa de Windows/DOS" : "Jogo Shockwave"}: não roda no navegador</span>`}
          <div class="cd-detalhe-acoes"><button class="cd-bt" type="button" id="cd-fav">${fav ? "★ Favorito" : "☆ Favoritar"}</button></div>
        </div>`;
      detalhe.querySelector("#cd-fav").addEventListener("click", () => { alternarFavorito(chaveJogo(id, j.arquivo)); preencher(); });
    }

    function selecionar(i, abrir = false) {
      const j = lista[i];
      if (!j) return;
      if (abrir || telaPequena()) { if (jogavel(j) || telaPequena()) location.hash = linkJogo(j); return; }
      estadoDisco.selecionado = j.arquivo;
      linhas.querySelectorAll(".cd-linha").forEach((l) => l.setAttribute("aria-selected", l.dataset.i === String(i)));
      linhas.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
      mostrarDetalhe();
    }

    linhas.addEventListener("click", (e) => { const l = e.target.closest(".cd-linha"); if (l) selecionar(+l.dataset.i); });
    linhas.addEventListener("dblclick", (e) => { const l = e.target.closest(".cd-linha"); if (l) selecionar(+l.dataset.i, true); });
    tabela.addEventListener("keydown", (e) => {
      const i = lista.findIndex((j) => j.arquivo === estadoDisco.selecionado);
      const passo = { ArrowDown: 1, ArrowUp: -1, PageDown: 15, PageUp: -15 }[e.key];
      if (passo) { e.preventDefault(); selecionar(Math.max(0, Math.min(lista.length - 1, i + passo))); }
      else if (e.key === "Home") { e.preventDefault(); selecionar(0); }
      else if (e.key === "End") { e.preventDefault(); selecionar(lista.length - 1); }
      else if (e.key === "Enter") { e.preventDefault(); selecionar(i, true); }
    });
    corpo.querySelector(".cd-pesquisa").addEventListener("submit", (e) => { e.preventDefault(); estadoDisco.busca = campo.value; preencher(); });
    campo.addEventListener("input", () => { estadoDisco.busca = campo.value; preencher(); });
    corpo.querySelector("#cd-todos").addEventListener("click", () => { campo.value = ""; Object.assign(estadoDisco, { busca: "", categoria: "todos" }); desenharLista(); });
    corpo.querySelector("#cd-voltar").addEventListener("click", () => ir({ tela: "menu", busca: "" }));
    off?.addEventListener("change", () => { estadoDisco.mostrarOff = off.checked; preencher(); });
    preencher();
  }

  // barra de ferramentas
  const q = app.querySelector("#cd-q");
  app.querySelector(".cd-busca").addEventListener("submit", (e) => {
    e.preventDefault();
    ir({ tela: "lista", categoria: "todos", busca: q.value, selecionado: null });
  });
  app.querySelector("#bt-menu").addEventListener("click", () => ir({ tela: "menu", busca: "" }));
  if (d.trilha) ligarTrilha(app.querySelector("#bt-trilha"), base(d.trilha));
  const btEstante = app.querySelector("#bt-estante");
  if (btEstante) {
    const rotulo = () => (btEstante.textContent = minhaEstante().some((x) => x.item === d.item) ? "✓ Na minha estante (remover)" : "＋ Adicionar à minha estante");
    btEstante.addEventListener("click", () => { alternarMinhaEstante(d); rotulo(); });
    rotulo();
  }
  desenhar();
}

function ligarTrilha(botao, url) {
  const rotulo = botao.querySelector(".rotulo") || botao;
  const atualizar = () => {
    const tocando = !trilha.paused && trilha.src === url;
    rotulo.textContent = tocando ? "Desligar som" : "Ligar som";
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
    <section class="item-topo">
      <img src="https://archive.org/services/img/${esc(id)}" alt="">
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
    app.querySelector(".item-topo").after(h(`
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
