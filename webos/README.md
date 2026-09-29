# Palco Receiver — LG webOS

Variante webOS do receiver Palco: o `index.html` (HTML/JS único, ES5) em um
pacote **IPK** instalável via **Dev Mode** da LG. Compatível com webOS 4.x+
(testado em UM7510).

## Estrutura

```
webos/
├── appinfo.json    # id com.piano.louvorja.palco, version (bump a cada release!)
├── index.html      # o receiver — MESMO arquivo do tizen/ e androidtv/
├── icon80.png / icon130.png   # ícones launcher (>5KB; centenas de bytes = placeholder)
└── bg-fallback.png, splash-palco.*, logo-*  # assets (paths RELATIVOS)
```

## Instalar na TV LG (Developer Mode + ares CLI)

1. **Na TV**: instalar o app **"Developer Mode"** (LG Content Store) →
   ligar Dev Mode → religar a TV → anotar o **passphrase** (a TV mostra em
   minúsculas; usar MAIÚSCULAS no CLI) e o IP.
2. **No PC**:

   ```bash
   npm i -g @webos-tools/cli          # NÃO usar @webosose/ares-cli (é p/ placas OSE)
   ares-setup-device                  # prisoner@<ip-da-tv>:9922, nome ex.: tv
   ares-novacom --device tv --getkey  # passphrase = código em MAIÚSCULAS
   ssh-keygen -p -P <CODIGO> -N "" ~/.ssh/tv_webos
   ```
3. Empacotar e instalar:

   ```bash
   ares-package webos/                # gera com.piano.louvorja.palco_X.Y.Z_all.ipk
   ares-install --device tv <ipk>
   ares-launch --device tv com.piano.louvorja.palco
   # 1ª launch após install: SEM -c (o -c tenta fechar app que não está rodando e falha)
   ```

> Dev Mode expira ~50h — renovar no app da TV quando `ares-install` der
> timeout do nada.

## Conectar ao sender (celular/desktop PIANO)

A TV é **cliente** WebSocket: conecta no celular (sender HTTP :7080 /
WS :7081). O receiver auto-escaneia a rede (`/status` na /24) — ou use a
**tecla VERMELHA** do controle pra digitar IP/porta manualmente. Entrada
só-porta (`7082`) também funciona (slot multi-TV).

## Regras críticas do receiver (root causes reais)

- **NUNCA usar ES2020+** (`??`, `?.`) — o WAM (Chromium antigo) não parseia
  e o script INTEIRO morre silenciosamente (bug das versões 0.1.3-0.1.5).
  O CI valida por regex.
- Paths de assets SEMPRE **relativos** (`bg-fallback.png`, nunca
  `/bg-fallback.png`) — o IPK roda em `file://` e path absoluto aponta pra
  raiz do filesystem da TV (quebra silenciosa).
- Cache agressivo do webOS: sempre bump de `appinfo.json` version E do
  fallback hardcode da versão no idle do `index.html` (são 2 lugares).
- `index.html` == `tizen/index.html` == `androidtv/assets/palco/receiver.html`
  — o CI de paridade falha se divergirem.

## Debug na TV

```bash
# web inspector via CDP
curl http://<tv>:9998/json         # webSocketDebuggerUrl por página
# SSH direto (chave do ares):
ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa \
    -i ~/.ssh/tv_webos prisoner@<tv> -p 9922
```

## Publicação (Seller Lounge)

Fluxo completo de submissão (abas/save order, screenshots 1920×1080 etc.)
documentado internamente — homólogo do Seller Office Samsung. Qualquer
igreja instala sem Dev Mode.
