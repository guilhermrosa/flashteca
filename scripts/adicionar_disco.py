"""Adiciona um disco a data/discos.json a partir do corpo de uma issue (variável de ambiente CORPO).

O corpo precisa ter um bloco ```json com {"id", "titulo", "ano", "item", "iso"}, que é o que o botão
"Publicar na estante do site" da Flashteca gera. O item e a imagem de disco são conferidos no archive.org.
Escreve em $GITHUB_OUTPUT o título do disco, para a mensagem de commit.
"""
import json, os, re, sys, urllib.parse, urllib.request
from pathlib import Path

ARQ = Path(__file__).resolve().parent.parent / "data/discos.json"


def falhar(msg):
    print(f"::error::{msg}")
    Path(os.environ.get("ERRO_ARQ", "/tmp/erro.txt")).write_text(msg)
    sys.exit(1)


m = re.search(r"```json\s*(\{.*?\})\s*```", os.environ.get("CORPO", ""), re.S)
if not m:
    falhar("Não encontrei o bloco ```json com os dados do disco na issue.")
try:
    novo = json.loads(m.group(1))
except json.JSONDecodeError as e:
    falhar(f"O JSON da issue é inválido: {e}")

item, iso = str(novo.get("item", "")), str(novo.get("iso", ""))
if not re.fullmatch(r"[A-Za-z0-9._-]{1,200}", item):
    falhar("Identificador do item do archive.org inválido.")
titulo = str(novo.get("titulo") or item).strip()[:200]
ano = novo.get("ano")
ano = int(ano) if isinstance(ano, int) or (isinstance(ano, str) and ano.isdigit()) else None
id_disco = re.sub(r"[^a-z0-9-]+", "-", str(novo.get("id") or item).lower()).strip("-")[:80] or item.lower()

with urllib.request.urlopen(f"https://archive.org/metadata/{urllib.parse.quote(item)}", timeout=60) as r:
    meta = json.load(r)
if not meta.get("metadata"):
    falhar(f"O item {item} não existe no archive.org.")
if iso not in {f["name"] for f in meta.get("files", [])}:
    falhar(f"O item {item} não tem o arquivo {iso!r}.")

discos = json.loads(ARQ.read_text(encoding="utf-8"))
if any(d["item"] == item for d in discos):
    falhar(f"O disco {item} já está na estante.")
while any(d["id"] == id_disco for d in discos):
    id_disco += "-2"
discos.append({"id": id_disco, "titulo": titulo, "ano": ano, "item": item, "iso": iso})
ARQ.write_text(json.dumps(discos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"Adicionado: {titulo} ({item})")
with open(os.environ.get("GITHUB_OUTPUT", "/dev/null"), "a") as f:
    f.write(f"titulo={titulo.replace(chr(10), ' ')}\n")
