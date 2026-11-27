# Palco Receiver — LouvorJA

App receiver (Palco) para TVs — exibe a projeção enviada pelo app
PIANO LouvorJA (celular/desktop) via WebSocket próprio. **Não é
Chromecast/DLNA**: a TV é cliente WS que conecta no sender do operador
(desktop: HTTP :47080 / WS :47081; celular: HTTP :7080 / WS :7081; ou porta
do slot em multi-TV).

Cada subdiretório tem README próprio com instruções completas de build e
instalação:

| Pasta | Plataforma | Empacotamento | Instalação na TV |
|---|---|---|---|
| [`webos/`](webos/README.md) | LG webOS 4.x+ | IPK (`ares-package`) | Dev Mode + `ares-install` — ver [webos/README.md](webos/README.md) |
| [`tizen/`](tizen/README.md) | Samsung Tizen 4.0+ | WGT (zip + config.xml) | Dev Mode Samsung + `sdb install` — ver [tizen/README.md](tizen/README.md) |
| [`androidtv/`](androidtv/README.md) | Android TV / box / Fire TV | APK Flutter (WebView) | `adb install` / Play Store — ver [androidtv/README.md](androidtv/README.md) |
| [`roku/`](roku/README.md) | Roku OS 16.0+ | ZIP sideload (`npm run package`) | Developer Mode + sideload — ver [roku/README.md](roku/README.md) |

Todas compartilham o **MESMO receiver** (HTML/JS único) — paridade total de
features, validada no CI: scan automático do sender, IP/porta manual
(tecla vermelha), controle por remote (play/pause/stop/back/setas),
autoplay-mudo com desmute no 1º gesto, auto-relaunch, splash e identidade.

## Regras do receiver (HTML/JS) — valem pra TODAS as plataformas

- **NUNCA usar ES2020+** (`??`, `?.`) — Chromium antigo (webOS/Tizen) não
  parseia e o script inteiro morre silenciosamente (root cause das versões
  0.1.3-0.1.5). O CI bloqueia por regex.
- Assets com paths **RELATIVOS** (funciona em `file://` do IPK/WGT e HTTP
  do sender).
- `webos/index.html` == `tizen/index.html` ==
  `androidtv/assets/palco/receiver.html` — são o MESMO arquivo;
  sincronizar sempre (o CI de paridade falha o PR se divergir).
- Bump de versão em TODOS os manifestos (`appinfo.json`, `config.xml`,
  `pubspec.yaml`) junto do receiver — e no fallback hardcode da versão no
  idle do HTML.

## Arquitetura de conexão (leia antes de debugar)

O **sender** (celular APK ou desktop) é o servidor HTTP+WS. A **TV** é
cliente que conecta no IP do operador. Portas do desktop: HTTP 47080 /
WS 47081 (principal), 47082/47083+ (slots multi-TV). O celular e desktops
anteriores à troca usam 7080/7081; a busca automática procura as duas.
Detalhes, pitfalls de proxy de
mídia, autoplay e sync nas skills internas do projeto.

## Instalação em TVs Samsung (resumo — detalhe em tizen/README.md)

Caminho prático sem parceira Samsung: app **Developer Mode** (da Samsung,
na TV) + `sdb install` via Tizen Studio CLI — TV e PC na mesma rede.
Validação sem TV física: **Remote Test Lab** (TVs reais na nuvem, grátis).
Escala: **TV Seller Office** (nota: Public Seller só distribui nos EUA;
Brasil exige Partner Seller).

## Identificação das requisições à API

O receiver faz chamadas HTTP próprias ao relay (`/v1/palco/sessions` e busca
do token da sessão). Essas chamadas enviam `X-Client-Platform`
(`palco-webos`, `palco-tizen`, `palco-androidtv` ou `palco-browser`) e
`X-Client-Version`. Quando configurado, `X-Partner-Key` identifica o parceiro
Palco, independentemente do cliente que controla a sessão.

Crie chaves próprias do Palco em cada banco da API e cadastre os secrets
`PARTNER_KEY_STG` e `PARTNER_KEY_PROD` neste repositório. Não reutilize as
chaves do desktop, APK operador ou web. Os jobs de empacotamento e publicação
executam `node scripts/configure-partner-key.mjs` antes de gerar os artefatos.
O mesmo comando pode ser executado localmente com essas variáveis de ambiente;
sem elas, o receiver mantém o acesso sem chave de parceiro.

A configuração é incorporada no HTML, sem arquivo externo adicional. O script
lê a versão de `webos/appinfo.json`, sincroniza a configuração nos quatro
receivers e não imprime os valores das chaves. Ambas as chaves podem estar no
pacote: a URL efetiva escolhe staging ou produção. Somente as APIs HTTPS
`api-stg.pianolouvorja.com.br` e `api.pianolouvorja.com.br`, além da API local
em `localhost`/`127.0.0.1`, recebem a chave configurada nas rotas `/v1/palco`.
Upstream, CDN, Google/Firebase, chamadas LAN de `/status` e requisições
`no-cors` não recebem essa chave. A configuração não altera a URL do relay
selecionada pelo launcher ou por `?api=`.
Se o launcher usar o relay upstream `api.louvorja.com.br`, não será enviada
chave de parceiro. Para identificação na API Piano, a URL do relay deve
apontar para a API Piano do ambiente correspondente.

O token de parceiro é um identificador distribuído e revogável. Ele não
substitui o token da sessão do palco. O WebSocket mantém seu mecanismo atual
de autenticação e não recebe a chave de parceiro na URL. Uma chave de parceiro
desconhecida ou revogada enviada à API causa 401 nas chamadas HTTP.

## Releases

IPKs e APKs publicados em
https://github.com/Piano-Louvor-JA/palco-receiver/releases
(repo privado: asset URL exige token — para download direto da TV use Dev
Mode/scp, ou aguarde publicação em loja).

## Runbook de release (auto-update)

Fluxo da org: `feat/* → PR → staging → PR → main → tag v*`. A partir da
tag, o canal de updates publica sozinho:

1. **Merge em ordem** das PRs abertas para `staging` (review obrigatória)
2. **Bump** em branch `chore/version-X.Y.Z` a partir de `staging`:
   - `webos/appinfo.json` version **E** o hardcode `window.__PALCO_APPV__`
     no `webos/index.html` (2 lugares — o CI de tag valida se bateram)
   - `tizen/config.xml` widget version
   - `androidtv/pubspec.yaml` `X.Y.Z+N` (sempre incrementar o `+N`)
   - Sincronizar `webos/index.html` → `tizen/index.html` →
     `androidtv/assets/palco/receiver.html` (CI de paridade falha se divergir)
3. **PR `staging` → `main`**, merge com review
4. **Tag `vX.Y.Z`** (X.Y.Z limpo, sem sufixo — o updater compara números):
   ```bash
   git tag v0.1.44 && git push origin v0.1.44
   ```
5. O workflow `publish-update.yml` dispara na tag:
   - valida semver + sanidade (tag == appinfo == HTML)
   - publica HTML+assets+`manifest.json` na `gh-pages` do repo público
     [`Piano-Louvor-JA/palco-updates`](https://github.com/Piano-Louvor-JA/palco-updates)
     (repo de artefato — **só o CI escreve**, branches protegidas)
   - espera o GitHub Pages propagar
6. O updater automático só existiu nas TVs 0.1.43 e 0.1.44, e elas consultam
   o endereço antigo `pianolouvorja.github.io`, que deixou de responder com a
   troca de nome da organização. As demais versões **não têm updater**: a
   atualização é pelo pacote da loja/release ou abrindo o canal no navegador.

Envie cada tag em uma chamada de `git push` separada. O GitHub não gera os
eventos de publicação quando mais de três tags são enviadas no mesmo push.

Para retomar uma publicação que falhou, preserve as tags existentes e execute
o workflow da `main`, informando a tag exata:

```bash
gh workflow run publish-update.yml --ref main -f release_tag=v0.5.0
gh workflow run ci.yml --ref main -f release_tag=tizen-v0.5.0
```

A retomada aceita somente tags estáveis que já pertencem ao histórico da
`main`. O primeiro comando retoma o canal; o segundo recompõe o pacote da
plataforma indicada, usando os arquivos da tag sem movê-la. Aguarde os checks
e confira a versão publicada antes de anunciar a atualização.

Canal público (serve receiver em qualquer browser, zero install):
`https://piano-louvor-ja.github.io/palco-updates/manifest.json`

Secrets necessários (já configurados): `PALCO_UPDATES_TOKEN` (PAT com
escopo `repo`) no palco-receiver.

