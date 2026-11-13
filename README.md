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
  - *Game Mix Nº 1 — GMIX001* (2004): 302 jogos em Flash (o disco tem outros 157 de Windows/DOS).
- **Minha estante**: ao abrir no explorador um disco com o menu da Digerati, dá para abri-lo com capas e
  categorias e guardá-lo na estante do navegador, ou publicá-lo na estante do site (veja abaixo).
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

## Como os discos são lidos

Não há catálogo pré-gerado: o site lê o menu original do CD direto da imagem no archive.org e guarda
o resultado no navegador. Dois formatos de menu da Digerati são reconhecidos (`js/catalogo.js`):

- **XML** (discos de ~2007 em diante): pasta `XML/` com um arquivo por categoria, em Windows-1252.
- **Planilha** (discos de ~2004): `interface/conteudo.htm`, uma tabela exportada do Excel.

Jogos que o CD abria por uma página HTML têm o `.swf` embutido descoberto na hora de jogar.
Programas de Windows/DOS e jogos Shockwave aparecem marcados e ficam escondidos por padrão.

## Adicionar um disco à estante

Pelo site: em **Explorar o Archive**, abra o item; se o disco tiver um menu reconhecível, aparece
**Abrir com o menu do disco**. Lá há dois botões:

- **Adicionar à minha estante**: fica só no seu navegador.
- **Publicar na estante do site**: abre uma issue já preenchida neste repositório. A Action
  `.github/workflows/adicionar-disco.yml` confere o item no archive.org, acrescenta o disco em
  `data/discos.json`, faz o commit em nome de quem abriu a issue e fecha a issue. Só issues abertas
  pelo dono do repositório são processadas.

À mão: acrescente `{ "id", "titulo", "ano", "item", "iso" }` em `data/discos.json`.

Outros discos já encontrados no acervo: *Jogos de Menina + de 300* (`goma_300`),
*+ de 260* (`joma_260`), *+ de 200* (`jome_200`), *Girl Games* nº 2, 8 e 13 (`JOMA002`, `JOMA008`, `joma-013`),
*Girl Games Especial nº 2* (`girlgames_esp2`), *Jogos de Menina* nº 15, 18 e 19 (`JOME015`, `jome018_202509`, `jome-019`),
*Game Mix* 2, 3 e 4 (`gmix-002-digerati`, `digerati-500-jogos-game-mix-03`, `gmix-004-digerati`),
*500 Supergames Digerati* (`cd-digerati-500`), *+ de 450 Jogos* (`maisde450jogos`).

## Estrutura

```
index.html          casca da página, carrega o Ruffle (unpkg) e o app
js/app.js           rotas (#/, #/disco/…, #/explorar, #/item/…), telas e player
js/archive.js       metadados, busca e listagem de imagens de disco no archive.org
js/catalogo.js      leitura dos menus originais dos CDs (XML e planilha)
css/style.css       visual
data/discos.json    discos da estante do site
scripts/            script usado pela Action de publicar disco
.github/workflows/  Action que publica discos a partir de issues
```

Os direitos dos jogos pertencem aos seus autores; este projeto apenas aponta para o acervo público do Internet Archive.
