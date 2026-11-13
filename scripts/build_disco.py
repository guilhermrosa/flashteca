"""Gera data/<id>.json para um disco da Digerati (menu com pasta XML/ e miniaturas em Interface/Imagens/).

Uso: python3 scripts/build_disco.py <id>
O disco precisa estar em data/discos.json (id, titulo, ano, item, iso). O script baixa do archive.org
a listagem da imagem de disco e os XMLs de catálogo, confere cada caminho e grava o JSON.
"""
import html, json, re, sys, unicodedata, urllib.parse, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
IGNORAR = {"ESSENCIAIS", "WALLPAPERS", "ANTI-VÍRUS", "ANTI-VIRUS", "AVG"}
MINUSCULAS = {"de", "da", "do", "e", "a", "o"}


def baixar(url):
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read()


def url_iso(d, caminho=""):
    q = lambda p: "/".join(urllib.parse.quote(s) for s in p.split("/"))
    return f"https://archive.org/download/{d['item']}/{q(d['iso'])}/{q(caminho)}"


def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def nome_categoria(s):
    palavras = s.lower().split()
    return " ".join(p if i and p in MINUSCULAS else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def campo(bloco, tag):
    m = re.search(rf"<{tag}>(.*?)</{tag}>", bloco, re.S)
    return html.unescape(m.group(1).strip()) if m else ""


def main(id_disco):
    d = next(x for x in json.loads((RAIZ / "data/discos.json").read_text()) if x["id"] == id_disco)

    listagem = baixar(url_iso(d)).decode("utf-8", "replace")
    arquivos = [html.unescape(a) for a in re.findall(r'<tr><td><a href="[^"]*">([^<]+)</a>', listagem)]
    if not arquivos:
        sys.exit("Não consegui listar a imagem de disco.")
    por_min = {a.lower(): a for a in arquivos}
    imagens = {Path(a).stem.lower(): a for a in arquivos if a.lower().startswith("interface/imagens/")}

    def resolver(caminho):
        """Devolve (arquivo jogável, tipo) ou None."""
        real = por_min.get(caminho.lower())
        if not real:
            return None
        ext = real.rsplit(".", 1)[-1].lower()
        if ext == "swf":
            return real, "swf"
        if ext == "dcr":
            return real, "shockwave"
        if ext == "exe":
            return real, "windows"
        if ext in ("htm", "html"):  # página que embute o jogo: pega o filme referenciado nela
            pasta = real.rsplit("/", 1)[0]
            pagina = baixar(url_iso(d, real)).decode("cp1252", "replace")
            for ref in re.findall(r"""(?:movie|src)['"]?\s*(?:value\s*)?=\s*['"]?([^'" >]+\.(?:swf|dcr))""", pagina, re.I):
                alvo = por_min.get(f"{pasta}/{ref}".lower())
                if alvo:
                    return alvo, "swf" if alvo.lower().endswith(".swf") else "shockwave"
        return None

    xmls = sorted(a for a in arquivos if re.fullmatch(r"xml/[^/]+\.xml", a, re.I))
    categorias, faltando = [], []
    for x in xmls:
        texto = baixar(url_iso(d, x)).decode("cp1252")
        raiz = re.search(r'<\w+ name="([^"]+)"', texto)
        bruto = (raiz.group(1) if raiz else Path(x).stem).strip()
        if bruto.upper() in IGNORAR:
            continue
        jogos = []
        for bloco in re.findall(r"<TABELA>(.*?)</TABELA>", texto, re.S):
            if campo(bloco, "COMANDOS").upper() not in ("JOGAR", "EXECUTAR"):
                continue
            caminho = campo(bloco, "CAMINHO").replace("\\", "/").lstrip("/")
            r = resolver(caminho)
            if not r:
                faltando.append(caminho)
                continue
            jogos.append({
                "nome": campo(bloco, "NOME"),
                "descricao": campo(bloco, "DESCRICAO"),
                "controles": campo(bloco, "CONTROLES"),
                "arquivo": r[0],
                "imagem": imagens.get(campo(bloco, "IMAGEM").lower()),
                "tipo": r[1],
            })
        if not any(j["tipo"] == "swf" for j in jogos):
            continue
        jogos.sort(key=lambda j: j["nome"].lower())
        nome = nome_categoria(bruto)
        categorias.append({"id": slug(nome), "nome": nome, "jogos": jogos})
    categorias.sort(key=lambda c: c["id"])

    extras = {"trilha": "interface/trilha.mp3", "revista": "interface/revista/revista.pdf"}
    saida = {**d, **{k: por_min[v] for k, v in extras.items() if v in por_min}, "categorias": categorias}
    (RAIZ / f"data/{d['id']}.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")

    todos = [j for c in categorias for j in c["jogos"]]
    tipos = {t: sum(j["tipo"] == t for j in todos) for t in ("swf", "shockwave", "windows")}
    print(f"{d['id']}: {len(todos)} jogos {tipos} em {len(categorias)} categorias: {[c['nome'] for c in categorias]}")
    print(f"sem imagem: {sum(not j['imagem'] for j in todos)} | caminhos ausentes na imagem: {faltando}")


if __name__ == "__main__":
    main(sys.argv[1])
