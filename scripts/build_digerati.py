"""Gera data/digerati.json a partir dos XMLs de catálogo do DVD Digerati Games.

Uso: python3 scripts/build_digerati.py <pasta_com_xmls> <listing.html da ISO> <saida.json>
A listagem é a página https://archive.org/download/<item>/<iso>/ salva em HTML;
ela serve para corrigir maiúsculas/minúsculas dos caminhos e marcar arquivos ausentes.
"""
import html, json, re, sys, urllib.parse
from pathlib import Path

ORDEM = ["AÇÃO", "AVENTURA", "CORRIDA", "ESPORTES", "ESTRATÉGIA", "LUTA", "NAVE", "PUZZLE"]
NOMES = {"AÇÃO": "Ação", "AVENTURA": "Aventura", "CORRIDA": "Corrida", "ESPORTES": "Esportes",
         "ESTRATÉGIA": "Estratégia", "LUTA": "Luta", "NAVE": "Nave", "PUZZLE": "Puzzle"}

def campo(bloco, tag):
    m = re.search(rf"<{tag}>(.*?)</{tag}>", bloco, re.S)
    return html.unescape(m.group(1).strip()) if m else ""

def main(xml_dir, listing, out):
    s = Path(listing).read_text(encoding="utf-8", errors="replace")
    arquivos = [urllib.parse.unquote(r) for r in re.findall(r'<a href="[^"]*\.iso/([^"]+)">', s)]
    por_minusculo = {a.lower(): a for a in arquivos}
    imagens = {Path(a).stem.lower(): a for a in arquivos if a.startswith("Interface/Imagens/")}

    categorias, faltando = [], []
    for cat in ORDEM:
        texto = (Path(xml_dir) / f"{cat}.xml").read_bytes().decode("cp1252")
        jogos = []
        for bloco in re.findall(r"<TABELA>(.*?)</TABELA>", texto, re.S):
            caminho = campo(bloco, "CAMINHO").replace("\\", "/").lstrip("/")
            real = por_minusculo.get(caminho.lower())
            if not real:
                faltando.append(caminho)
                continue
            img = imagens.get(campo(bloco, "IMAGEM").lower())
            tipo = "swf" if real.lower().endswith(".swf") else "shockwave"
            if tipo == "shockwave":  # o .htm só embute o game.dcr da mesma pasta
                real = real.rsplit("/", 1)[0] + "/game.dcr"
            jogos.append({
                "nome": campo(bloco, "NOME"),
                "descricao": campo(bloco, "DESCRICAO"),
                "controles": campo(bloco, "CONTROLES"),
                "arquivo": real,
                "imagem": img,
                "tipo": tipo,
            })
        jogos.sort(key=lambda j: j["nome"].lower())
        categorias.append({"id": NOMES[cat].lower().translate(str.maketrans("çãé", "cae")), "nome": NOMES[cat], "jogos": jogos})

    dados = {
        "id": "digerati",
        "titulo": "Digerati Games — 450 Jogos em DVD",
        "ano": 2007,
        "item": "digerati-games-450-jogos-em-dvd-para-computador",
        "iso": "Digerati Games - 450 Jogos em DVD.iso",
        "capa": "Digerati Games - 450 Jogos em DVD (Foto).png",
        "trilha": "Interface/trilha.mp3",
        "revista": "Interface/revista/revista.pdf",
        "categorias": categorias,
    }
    Path(out).write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(c["jogos"]) for c in categorias)
    print(f"{total} jogos, {len(faltando)} caminhos ausentes na ISO: {faltando}")
    print("sem imagem:", [j["nome"] for c in categorias for j in c["jogos"] if not j["imagem"]])

if __name__ == "__main__":
    main(*sys.argv[1:4])
