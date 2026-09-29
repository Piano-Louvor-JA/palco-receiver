# Palco Receiver — Samsung TV (Tizen)

Variante Tizen do receiver Palco. O **mesmo** `index.html` do webOS em uma
casca de empacotamento `.wgt` (config.xml + assets). Requer Tizen **4.0+**.

## Estrutura

```
tizen/
├── config.xml      # widget config (id com.piano.louvorja.palco, required_version 4.0)
├── index.html      # MESMO receiver do webos/ — sincronizar sempre (ver regra abaixo)
├── signature1.xml / author-signature.xml  # assinaturas dev (regenerar com seu certificado)
├── bg-fallback.png, splash-palco.jpg, logo-*  # assets (paths RELATIVOS no HTML)
└── com.piano.louvorja.palco_0.1.0.wgt      # build antigo de referência
```

## Como instalar em TVs Samsung — os 3 caminhos reais

### Caminho A — Developer Mode na TV do usuário (recomendado pra começar)

TV e PC/celular na **mesma rede**. É a "brecha" oficial que a Samsung deixa
aberta pra desenvolvedores: o app **Dev Mode** da própria Samsung, instalado
da TV's App Store, libera `sdb install` direto na TV — sem parceira, sem
loja, sem custo.

1. **Na TV** (menu Apps → search): instalar o app **"Developer Mode"**
   (Samsung). Abrir, ligar o toggle e logar com uma conta Samsung (gratuita).
   Ele mostra o **IP da TV** e uma **porta** (ex.: `192.168.1.50:26101`).
2. **No PC**, instalar o Tizen Studio CLI (~300MB, não precisa IDE):

   ```bash
   curl -sL -o tizen.bin "https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_ubuntu-64.bin"
   ./tizen.bin --accept-license --no-java-check ~/tizen-studio
   # Java 17 obrigatório pro Package Manager (Java 21 quebra: JAXB removido)
   sudo apt install openjdk-17-jre-headless
   ```

3. Conectar e instalar:

   ```bash
   export PATH=~/tizen-studio/tools:$PATH
   sdb connect <ip-da-tv>:<porta-do-devmode>   # porta mostrada no app Dev Mode
   sdb devices                                  # deve listar a TV
   sdb install com.piano.louvorja.palco_X.Y.Z.wgt
   sdb shell execute_app com.piano.louvorja.palco
   ```

> **Limitação honesta**: o Dev Mode da TV exige **renovação periódica**
> (reabrir o app Developer Mode e relogar a cada ~50h de uso acumulado —
> mesma limitação do Dev Mode do webOS). Pra uso permanente sem toque,
> veja o Caminho C.

### Caminho B — Remote Test Lab (validação sem TV Samsung física)

Samsung disponibiliza TVs reais na nuvem, grátis (créditos renováveis):
`developer.samsung.com/remotetestlab` — login com conta Samsung comum.
Reserve uma TV, use o botão **SDB** do painel (exige clique físico no
navegador — não automatizável) e o `sdb install` funciona como no Caminho A.
Ideal pra validar keycodes e comportamento antes de instalar na TV da igreja.

### Caminho C — Samsung TV Seller Office (escala / produção)

Distribuição pela loja da Samsung (qualquer igreja instala sem PC):

1. `developer.samsung.com` → TV Seller Office (signup com a conta dev).
2. Upload do `.wgt` + screenshots + metadados (fluxo análogo ao Seller
   Lounge da LG). Review ~1-7 dias.
3. **Atenção BR**: o perfil **Public Seller só distribui nos EUA** — para
   Brasil é preciso solicitar **Partner Seller** (aprovação manual).

## Empacotar o .wgt

```bash
cd tizen/
rm -f palco.wgt
zip -qr palco.wgt index.html config.xml bg-fallback.png splash-palco.jpg \
  logo-louvor-ja.svg logo-piano-louvorja.png
# assinar com Tizen Studio (certificate-signature) antes do sdb install em TV física;
# sessões RTL aceitam wgt dev sem assinatura Samsung Partner
```

Bump de `config.xml` version a cada release junto do receiver.

## Regras do receiver (valem pra TIZEN também)

- **NUNCA usar ES2020+** (`??`, `?.`) — o motor antigo não parseia e o
  script inteiro morre silenciosamente
- Paths de assets SEMPRE relativos (funciona em `file://` do pacote)
- `tizen/index.html` == `webos/index.html` — sincronizar sempre
- Keycodes Tizen no remote: RETURN=10009, OK/Enter=13, PLAY=415,
  PAUSE=19, STOP=413, setas 37-40 (diferem do webOS — ver receiver)

## Debug

```bash
sdb forward tcp:9222 localabstract:webinspector
# chrome://inspect no PC
```
