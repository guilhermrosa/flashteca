// Acesso ao Internet Archive. Todos os endpoints usados aqui respondem com CORS liberado.

// Formatos que o archive.org consegue abrir por dentro (view_archive.php).
export const CONTEINERES = /\.(iso|zip|rar|7z|tar|cdr|img)$/i;

// Codifica cada segmento do caminho, preservando as barras.
export const caminhoNoArchive = (p) => p.split("/").map(encodeURIComponent).join("/");

// URL de um arquivo dentro de uma imagem de disco: /download/<item>/<imagem>/<caminho interno>
export function urlArquivo(item, conteiner, caminho) {
  return `https://archive.org/download/${encodeURIComponent(item)}/${caminhoNoArchive(conteiner)}/${caminhoNoArchive(caminho)}`;
}

export async function metadadosItem(id) {
  const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`archive.org respondeu ${r.status}`);
  const meta = await r.json();
  if (!meta.metadata) throw new Error(`Item "${id}" não existe ou não está disponível.`);
  return meta;
}

// Lista o conteúdo de uma imagem de disco pela página view_archive.php do próprio servidor do item.
export async function carregarListagem(meta, conteiner) {
  const url = `https://${meta.server}/view_archive.php?archive=${encodeURIComponent(meta.dir + "/" + conteiner)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`archive.org respondeu ${r.status}`);
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const linhas = [...doc.querySelectorAll("table tr")];
  const itens = [];
  for (const tr of linhas) {
    const a = tr.querySelector("td a");
    if (!a) continue;
    const celulas = tr.querySelectorAll("td");
    itens.push({ caminho: a.textContent.trim(), tamanho: parseInt(celulas[celulas.length - 1]?.textContent, 10) || 0 });
  }
  if (!itens.length && /error|could not/i.test(doc.body?.textContent || "")) {
    throw new Error("o archive.org não conseguiu abrir esta imagem");
  }
  return itens;
}

export async function buscarItens(termo) {
  const q = `(${termo}) AND mediatype:software`;
  const params = new URLSearchParams({ q, rows: "60", output: "json" });
  ["identifier", "title", "date", "year", "creator"].forEach((f) => params.append("fl[]", f));
  const r = await fetch(`https://archive.org/advancedsearch.php?${params}`);
  if (!r.ok) throw new Error(`archive.org respondeu ${r.status}`);
  return (await r.json()).response.docs;
}
