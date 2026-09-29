# Palco Receiver — LouvorJA

App receiver (Palco) para TVs — exibe a projeção enviada pelo app
PIANO LouvorJA (celular/desktop) via WebSocket próprio. **Não é
Chromecast/DLNA**: a TV é cliente WS que conecta no sender do operador
(HTTP :7080 / WS :7081, ou porta do slot em multi-TV).

Cada subdiretório tem README próprio com instruções completas de build e
instalação:

| Pasta | Plataforma | Empacotamento | Instalação na TV |
|---|---|---|---|
| [`webos/`](webos/README.md) | LG webOS 4.x+ | IPK (`ares-package`) | Dev Mode + `ares-install` — ver [webos/README.md](webos/README.md) |
| [`tizen/`](tizen/README.md) | Samsung Tizen 4.0+ | WGT (zip + config.xml) | Dev Mode Samsung + `sdb install` — ver [tizen/README.md](tizen/README.md) |
| [`androidtv/`](androidtv/README.md) | Android TV / box / Fire TV | APK Flutter (WebView) | `adb install` / Play Store — ver [androidtv/README.md](androidtv/README.md) |

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
cliente que conecta no IP do operador. Portas: HTTP 7080 / WS 7081
(principal), 7082/7083+ (slots multi-TV). Detalhes, pitfalls de proxy de
mídia, autoplay e sync nas skills internas do projeto.

## Instalação em TVs Samsung (resumo — detalhe em tizen/README.md)

Caminho prático sem parceira Samsung: app **Developer Mode** (da Samsung,
na TV) + `sdb install` via Tizen Studio CLI — TV e PC na mesma rede.
Validação sem TV física: **Remote Test Lab** (TVs reais na nuvem, grátis).
Escala: **TV Seller Office** (nota: Public Seller só distribui nos EUA;
Brasil exige Partner Seller).

## Releases

IPKs e APKs publicados em
https://github.com/pianolouvorja/palco-receiver/releases
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
     [`pianolouvorja/palco-updates`](https://github.com/pianolouvorja/palco-updates)
     (repo de artefato — **só o CI escreve**, branches protegidas)
   - espera o GitHub Pages propagar
6. **TVs na 0.1.43+** buscam o canal no boot (+4s) e de hora em hora; se
   a versão remota for maior e a TV estiver no idle (sem mídia), trocam
   sozinhas. TVs ≤0.1.42 **não têm updater** — último install manual.

Canal público (serve receiver em qualquer browser, zero install):
`https://pianolouvorja.github.io/palco-updates/manifest.json`

Secrets necessários (já configurados): `PALCO_UPDATES_TOKEN` (PAT com
escopo `repo`) no palco-receiver.

