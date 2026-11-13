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
  - *Digerati Jogos de Meninas #3 — 800 Jogos*: 824 jogos (moda virtual, maquiagem, culinária, decoração, aventura).
- **Explorar o Archive**: busque qualquer item de software do archive.org (ou cole o link) e a Flashteca
  lista os `.swf` dentro das imagens de disco para jogar.
- Favoritos e "jogados recentemente" (guardados no navegador), busca sem acento, tela cheia.

## Limitações

- Jogos **Shockwave** (`.dcr`, Adobe Director) não são suportados pelo Ruffle. No DVD de 450 jogos são 8.
- Alguns discos trazem programas de Windows (`.exe`) no catálogo; eles aparecem marcados e só dá para baixar.
- O Ruffle cobre bem ActionScript 1/2 e boa parte do AS3, mas alguns jogos podem ter falhas.

## Rodar localmente

Qualquer servidor estático serve (módulos ES não funcionam abrindo o arquivo direto):

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Adicionar um disco à estante

Os discos da Digerati usam todos o mesmo menu: uma pasta `XML/` com o catálogo de cada categoria
(nome, descrição, controles, caminho) e as miniaturas em `Interface/Imagens/`. Para adicionar um:

1. Inclua o disco em `data/discos.json` (`id`, `titulo`, `ano`, `item` do archive.org e nome do arquivo `iso`).
2. Rode o gerador, que baixa a listagem e os XMLs direto do archive.org e confere cada caminho:

```bash
python3 scripts/build_disco.py <id>
```

Isso grava `data/<id>.json`, e o disco já aparece na estante.

Outros discos já encontrados no acervo com o mesmo formato: *Jogos de Menina + de 300* (`goma_300`),
*+ de 260* (`joma_260`), *+ de 200* (`jome_200`), *Girl Games* nº 2, 8 e 13 (`JOMA002`, `JOMA008`, `joma-013`),
*Girl Games Especial nº 2* (`girlgames_esp2`), *Jogos de Menina* nº 15, 18 e 19 (`JOME015`, `jome018_202509`, `jome-019`),
*500 Supergames Digerati* (`cd-digerati-500`), *+ de 450 Jogos* (`maisde450jogos`).

## Estrutura

```
index.html          casca da página, carrega o Ruffle (unpkg) e o app
js/app.js           rotas (#/, #/disco/…, #/explorar, #/item/…), telas e player
js/archive.js       metadados, busca e listagem de imagens de disco no archive.org
css/style.css       visual
data/discos.json    discos da estante
data/<id>.json      catálogo de cada disco
scripts/            gerador de catálogo
```

Os direitos dos jogos pertencem aos seus autores; este projeto apenas aponta para o acervo público do Internet Archive.
