# Flashteca

Os CDs e DVDs de jogos em Flash que vinham em revistas e bancas, de volta ao navegador.

A Flashteca é um site estático (feito para o GitHub Pages) que abre coletâneas preservadas no
[Internet Archive](https://archive.org) e roda os jogos com o [Ruffle](https://ruffle.rs), um emulador
de Flash de código aberto escrito em Rust/WebAssembly.

**Nenhum jogo fica neste repositório.** Tudo é carregado sob demanda direto do archive.org, que
consegue servir arquivos de dentro de imagens ISO/ZIP e libera CORS para isso.

## O que tem

- **Estante**: discos com menu curado (capas, categorias, descrições e controles do catálogo original).
  - *Digerati Games — 450 Jogos em DVD* (2007): 454 jogos em 8 categorias, trilha do menu e revista em PDF.
- **Explorar o Archive**: busque qualquer item de software do archive.org (ou cole o link) e a Flashteca
  lista os `.swf` dentro das imagens de disco para jogar.
- Favoritos e "jogados recentemente" (guardados no navegador), busca sem acento, tela cheia.

## Limitações

- Jogos **Shockwave** (`.dcr`, Adobe Director) não são suportados pelo Ruffle. No DVD da Digerati são 8.
- O Ruffle cobre bem ActionScript 1/2 e boa parte do AS3, mas alguns jogos podem ter falhas.

## Rodar localmente

Qualquer servidor estático serve (módulos ES não funcionam abrindo o arquivo direto):

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Adicionar um disco à estante

1. Gere um `data/<id>.json` no mesmo formato de `data/digerati.json` (campos `item`, `iso`,
   `categorias[].jogos[]` com `nome`, `descricao`, `controles`, `arquivo`, `imagem`, `tipo`).
   Caminhos são relativos à raiz da imagem de disco.
2. Adicione o id na lista `DISCOS` em `js/app.js`.

O `scripts/build_digerati.py` mostra como o catálogo do DVD Digerati foi extraído dos XMLs
que o próprio menu do DVD usava (`XML/*.xml`, em Windows-1252):

```bash
python3 scripts/build_digerati.py <pasta-com-os-xmls> <listagem-da-iso.html> data/digerati.json
```

A listagem é a página `https://archive.org/download/<item>/<arquivo.iso>/` salva em HTML; ela serve
para corrigir maiúsculas/minúsculas dos caminhos e conferir que todo arquivo existe.

Candidatos encontrados no acervo: *700 jogos Digerati 2009*, *500 Supergames Digerati*,
*Digerati Flash Games Collection*.

## Estrutura

```
index.html          casca da página, carrega o Ruffle (unpkg) e o app
js/app.js           rotas (#/, #/disco/…, #/explorar, #/item/…), telas e player
js/archive.js       metadados, busca e listagem de imagens de disco no archive.org
css/style.css       visual
data/digerati.json  catálogo do DVD Digerati
scripts/            geradores de catálogo
```

Os direitos dos jogos pertencem aos seus autores; este projeto apenas aponta para o acervo público do Internet Archive.
