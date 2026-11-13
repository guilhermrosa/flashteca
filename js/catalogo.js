// Monta o catálogo de um disco direto da imagem no archive.org, lendo o menu original do CD.
// Formatos suportados (menus da Digerati):
//   - "xml":      pasta XML/ com um arquivo por categoria (discos de ~2007 em diante)
//   - "conteudo": interface/conteudo.htm, uma planilha exportada do Excel (discos de ~2004)
import { carregarListagem, metadadosItem, urlArquivo, CONTEINERES } from "./archive.js";

const VERSAO = 4; // mude para invalidar catálogos guardados no navegador
const IGNORAR = new Set(["ESSENCIAIS", "WALLPAPERS", "ANTI-VÍRUS", "ANTI-VIRUS", "AVG"]);
const MINUSCULAS = new Set(["de", "da", "do", "e", "a", "o"]);
const JOGAVEIS = new Set(["swf", "pagina"]);

const cp1252 = new TextDecoder("windows-1252");
const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const slug = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ehMaiusculo = (s) => s === s.toUpperCase();
function nomeCategoria(s) {
  if (!ehMaiusculo(s)) return s;
  return s.toLowerCase().split(/\s+/).map((p, i) => (i && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}
const extensao = (p) => p.split(".").pop().toLowerCase();
const pasta = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const radical = (p) => p.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();

function tipoDoArquivo(p) {
  const e = extensao(p);
  if (e === "swf") return "swf";
  if (e === "dcr") return "shockwave";
  if (e === "htm" || e === "html") return "pagina";
  if (["exe", "com", "bat"].includes(e)) return "windows";
  return null;
}

async function texto(item, conteiner, caminho) {
  const r = await fetch(urlArquivo(item, conteiner, caminho));
  if (!r.ok) throw new Error(`não consegui ler ${caminho} (${r.status})`);
  return cp1252.decode(await r.arrayBuffer());
}

// Detecta, só pela listagem, se a imagem tem um menu que a Flashteca entende.
export function detectarFormato(arquivos) {
  const caminhos = arquivos.map((a) => a.caminho.toLowerCase());
  if (caminhos.some((c) => /^xml\/[^/]+\.xml$/.test(c))) return "xml";
  if (caminhos.includes("interface/conteudo.htm")) return "conteudo";
  return null;
}

function lerTag(bloco, tag) {
  const m = bloco.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  const t = document.createElement("textarea");
  t.innerHTML = m[1].trim();
  return t.value;
}

async function categoriasXml(item, conteiner, arquivos, achar, classificar, imagens, progresso) {
  const xmls = arquivos.map((a) => a.caminho).filter((c) => /^xml\/[^/]+\.xml$/i.test(c)).sort();
  const categorias = [];
  let feitos = 0;
  await Promise.all(xmls.map(async (x) => {
    const t = await texto(item, conteiner, x);
    progresso?.(`Lendo categorias… ${++feitos}/${xmls.length}`);
    const bruto = (t.match(/<\w+ name="([^"]+)"/)?.[1] || x.split("/").pop().replace(/\.xml$/i, "")).trim();
    if (IGNORAR.has(bruto.toUpperCase())) return;
    const jogos = [];
    for (const [, bloco] of t.matchAll(/<TABELA>([\s\S]*?)<\/TABELA>/g)) {
      if (!["JOGAR", "EXECUTAR"].includes(lerTag(bloco, "COMANDOS").toUpperCase())) continue;
      const arquivo = achar(lerTag(bloco, "CAMINHO"));
      const tipo = arquivo && classificar(arquivo);
      if (!tipo) continue;
      jogos.push({
        nome: lerTag(bloco, "NOME"),
        descricao: lerTag(bloco, "DESCRICAO"),
        controles: lerTag(bloco, "CONTROLES"),
        arquivo, tipo,
        imagem: imagens.get(lerTag(bloco, "IMAGEM").toLowerCase()) || imagens.get(radical(arquivo)) || null,
      });
    }
    categorias.push({ nome: nomeCategoria(bruto), jogos });
  }));
  return categorias;
}

// Nos discos de 2004 as miniaturas não seguem uma regra só: podem ter o nome do arquivo, o número
// do jogo na tabela, o nome da pasta ou o título (às vezes abreviado). Tenta do mais exato ao mais solto.
function acharImagem(imagens, { arquivo, numero, nome }) {
  const norm = (x) => semAcento(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  const porNorm = (imagens._norm ??= new Map([...imagens].map(([k, v]) => [norm(k), v])));
  const partes = arquivo.split("/");
  const exatos = [radical(arquivo), numero, partes.length > 2 ? partes.at(-2).toLowerCase() : null];
  for (const k of exatos) if (k && imagens.has(k)) return imagens.get(k);
  for (const k of [nome, radical(arquivo)].map(norm)) if (porNorm.has(k)) return porNorm.get(k);
  // prefixo: "baroque" ↔ "Baroque Shooting", "blast" ↔ "Blast Em!" (exige 5+ letras e pega o mais longo)
  const alvo = norm(nome);
  let melhor = null;
  for (const [k, v] of porNorm) {
    if (k.length >= 5 && !/^\d+$/.test(k) && (alvo.startsWith(k) || (k.startsWith(alvo) && alvo.length >= 5)) && (!melhor || k.length > melhor[0].length)) melhor = [k, v];
  }
  return melhor?.[1] || null;
}

async function categoriasConteudo(item, conteiner, achar, classificar, imagens, progresso) {
  progresso?.("Lendo a lista de conteúdo do disco…");
  const doc = new DOMParser().parseFromString(await texto(item, conteiner, "interface/conteudo.htm"), "text/html");
  const categorias = [];
  let atual = null;
  for (const tr of doc.querySelectorAll("tr")) {
    const celulas = [...tr.querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (celulas.length === 1) { // linha solta: título do disco ou nome de uma categoria nova
      atual = { nome: nomeCategoria(celulas[0]), jogos: [] };
      categorias.push(atual);
      continue;
    }
    if (!atual || celulas.length < 4 || !/^\d+$/.test(celulas[0])) continue; // cabeçalho "#" e lixo
    const [numero, nome] = celulas;
    const caminho = celulas.at(-1);
    const [descricao, controles] = celulas.length >= 5 ? [celulas[2], celulas[3]] : [celulas[2], ""];
    const arquivo = achar(caminho);
    const tipo = arquivo && classificar(arquivo);
    if (!tipo) continue;
    atual.jogos.push({ nome, descricao, controles, arquivo, tipo, imagem: acharImagem(imagens, { arquivo, numero, nome }) });
  }
  return categorias;
}

// Lê o disco inteiro e devolve { item, iso, titulo, ano, formato, trilha, revista, categorias }.
export async function montarCatalogo(item, { conteiner, progresso } = {}) {
  progresso?.("Lendo informações do item…");
  const meta = await metadadosItem(item);
  const candidatos = (meta.files || []).filter((f) => CONTEINERES.test(f.name)).map((f) => f.name);
  if (conteiner) candidatos.unshift(conteiner);

  for (const c of [...new Set(candidatos)]) {
    progresso?.(`Abrindo ${c}…`);
    const arquivos = await carregarListagem(meta, c).catch(() => []);
    const formato = detectarFormato(arquivos);
    if (!formato) continue;

    const porMin = new Map(arquivos.map((a) => [a.caminho.toLowerCase(), a.caminho]));
    // se o arquivo citado não foi gravado no CD, tenta o mesmo nome com outra extensão (ex.: .htm → .swf)
    const achar = (p) => {
      const c = p.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
      if (porMin.has(c)) return porMin.get(c);
      const sem = c.replace(/\.[^./]+$/, "");
      for (const ext of ["swf", "dcr", "exe", "com"]) if (porMin.has(`${sem}.${ext}`)) return porMin.get(`${sem}.${ext}`);
      return null;
    };
    // página em pasta com .dcr e nenhum .swf: é um jogo Shockwave (o Ruffle não roda)
    const extsPorPasta = new Map();
    for (const a of arquivos) {
      const k = pasta(a.caminho).toLowerCase();
      if (!extsPorPasta.has(k)) extsPorPasta.set(k, new Set());
      extsPorPasta.get(k).add(extensao(a.caminho));
    }
    const classificar = (arquivo) => {
      const tipo = tipoDoArquivo(arquivo);
      const exts = extsPorPasta.get(pasta(arquivo).toLowerCase());
      return tipo === "pagina" && exts?.has("dcr") && !exts.has("swf") ? "shockwave" : tipo;
    };
    const imagens = new Map(arquivos.filter((a) => /^interface\/imagens\//i.test(a.caminho)).map((a) => [radical(a.caminho), a.caminho]));

    const brutas = formato === "xml"
      ? await categoriasXml(item, c, arquivos, achar, classificar, imagens, progresso)
      : await categoriasConteudo(item, c, achar, classificar, imagens, progresso);

    const categorias = brutas
      .filter((cat) => cat.jogos.some((j) => JOGAVEIS.has(j.tipo)))
      .map((cat) => ({ id: slug(cat.nome), nome: cat.nome, jogos: cat.jogos.sort((a, b) => a.nome.localeCompare(b.nome, "pt")) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!categorias.length) continue;

    const md = meta.metadata || {};
    return {
      item, iso: c, formato,
      titulo: [md.title].flat()[0] || item,
      ano: Number(String(md.date || "").slice(0, 4)) || null,
      trilha: achar("interface/trilha.mp3"),
      revista: achar("interface/revista/revista.pdf"),
      categorias,
    };
  }
  throw new Error("Não encontrei um menu de disco que a Flashteca saiba ler neste item.");
}

// Versão com cache no navegador (o catálogo de um disco não muda).
const chaveCache = (item) => `flashteca:catalogo:v${VERSAO}:${item}`;
export function catalogoSalvo(item) {
  try { return JSON.parse(localStorage.getItem(chaveCache(item))); } catch { return null; }
}
export async function catalogoComCache(item, opcoes) {
  const salvo = catalogoSalvo(item);
  if (salvo) return salvo;
  const cat = await montarCatalogo(item, opcoes);
  try { localStorage.setItem(chaveCache(item), JSON.stringify(cat)); } catch {}
  return cat;
}

// Jogos que o CD abria por uma página HTML: descobre qual SWF (ou DCR) ela embute.
// `achar` corrige maiúsculas/minúsculas contra a listagem real da imagem (o CD era de Windows).
export async function resolverPagina(item, conteiner, caminho, achar = (p) => p) {
  const html = await texto(item, conteiner, caminho);
  // a ordem do HTML põe o <param name="movie"> antes do <embed>, e ele costuma ser o jogo
  const refs = [...html.matchAll(/(?:movie|src|data)["']?\s*(?:value\s*)?=\s*["']?([^"'\s>]+\.(?:swf|dcr))/gi)]
    .map((m) => m[1].split(/[?#]/)[0])
    .filter((r) => !/^[a-z]+:/i.test(r));
  for (const ref of refs) {
    const partes = ref.startsWith("/") ? [] : pasta(caminho).split("/").filter(Boolean);
    for (const p of decodeURIComponent(ref).replace(/\\/g, "/").split("/")) {
      if (p === "..") partes.pop();
      else if (p && p !== ".") partes.push(p);
    }
    const alvo = achar(partes.join("/"));
    if (alvo) return { caminho: alvo, tipo: extensao(alvo) === "dcr" ? "shockwave" : "swf" };
  }
  return null;
}

// Listagem de uma imagem guardada em memória, para resolver caminhos sem baixar de novo.
const listagens = new Map();
export function acharNaImagem(item, conteiner) {
  const chave = item + "|" + conteiner;
  if (!listagens.has(chave)) {
    listagens.set(chave, metadadosItem(item)
      .then((meta) => carregarListagem(meta, conteiner))
      .then((arqs) => new Map(arqs.map((a) => [a.caminho.toLowerCase(), a.caminho]))));
  }
  return listagens.get(chave).then((mapa) => (p) => mapa.get(p.toLowerCase()) || null);
}
