# Issue #43 — auditoria, correção e aceite físico

Branch local: `fix/43-androidtv-local-connection`, baseada em `origin/staging`
`c27df82` (inclui PR #44 e mudanças posteriores, versão atual `0.4.0+13`).
Nenhum commit, push, PR, tag, release ou merge foi realizado nesta implementação.
A Issue #43 deve permanecer aberta. O botão vermelho está fora do escopo.

## Evidências e limites do diagnóstico

| Evidência | Conclusão permitida |
| --- | --- |
| TCL registra IPv4 `192.168.18.20`; navegador acessa o Desktop | O PR #44 resolveu a informação de sub-rede; isso não comprova que `fetch()` da WebView lê `/status`. |
| Desktop retorna HTTP 200 sem `Access-Control-Allow-Origin` (relato do teste físico) | Acessibilidade HTTP não implica permissão de leitura entre origens. |
| `webview_flutter_android 4.14.0`, fixado no lockfile, implementa `loadFlutterAsset` com `Uri.file('/android_asset/...')` | O caminho configurado neste app é `file:///android_asset/flutter_assets/assets/palco/receiver.html`. Não existe AssetLoader HTTPS configurado aqui. |
| Teste com Chromium real, servidor HTTP real sem CORS e página `file:`: fetch rejeita; o controle com CORS lê o mesmo JSON | Bloqueio de leitura pelo navegador reproduzido, sem mock de fetch e sem desativar segurança. |
| Receiver completo em Chromium abre WebSocket real, envia `hello` e renderiza `identify` | O protocolo WS não depende de CORS do `/status`; ainda não comprova o comportamento do firmware TCL. |
| Código anterior aguardava todos os fetches sem prazo, capturava erros como `null` e mutava `port` em cada resposta concorrente | Há bloqueio potencial de lote e corrida de porta, além da restrição de origem. Regressões agora exercitadas. |

**Causa estrutural confirmada:** descoberta dependia de ler JSON HTTP de outra origem
usando o navegador, sem garantia de CORS e sem timeout. Informar o IP correto não
remove essa barreira. O teste automatizado anterior substituía fetch por Promises
imediatas e, portanto, não podia detectá-la.

**Ainda não confirmado na TCL:** qual mensagem exata a WebView emite (CORS,
restrição da origem `file:` ou outro bloqueio), e se existe também falha de handshake
WS no dispositivo. HTTPS → HTTP/WS não é a origem configurada no código auditado;
não há evidência para afirmar mixed content como causa do APK instalado. Ausência
de mensagens no logcat não demonstra ausência de erros.

Manifest auditado: `INTERNET`, `ACCESS_NETWORK_STATE` e
`usesCleartextTraffic="true"` já estão presentes; JavaScript já estava habilitado.
Essas opções não concedem CORS. Não há configuração de mixed content nem
AssetLoader HTTPS nesta camada. Bonsoir apenas **anuncia a TV**, com porta dummy;
não descobre o Desktop. O caminho relevante é IPv4 Flutter → busca `/status` →
seleção host/porta → WebSocket `/palco` → `hello`/mensagens/reconexão.

Fontes primárias:

- [Implementação do plugin fixado em 4.14.0](https://github.com/flutter/packages/blob/webview_flutter_android-v4.14.0/packages/webview_flutter/webview_flutter_android/lib/src/android_webview_controller.dart).
- [Android: conteúdo local e origens opacas](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).

## Implementação

- `lib/local_status_client.dart`: somente GET `/status`, IPv4 privado literal e
  porta 1024–65535; sem DNS, proxy de sistema, redirects, cookies, autorização ou
  URLs arbitrárias. Prazo total 1200 ms, corpo máximo 16 KiB, até 192 operações
  simultâneas. Retorna apenas classificação e booleano `unlocked`, nunca o corpo.
- `lib/main.dart`: registra canais antes de carregar o asset; nonce por documento,
  validação de mensagens, cancelamento, navegação principal restrita ao Receiver,
  logs classificados sem URLs com tokens. Preserva origem, arquivos relativos,
  permissões e política de mixed content. Nenhum universal file access habilitado.
- HTML idêntico nas três plataformas: Android usa o canal nativo para status;
  webOS/Tizen continuam usando fetch, agora limitado e cancelável. O IP do Flutter
  chega antes de começar a busca Android. Geração protege resultados, portas,
  temporizadores, sockets e respostas atrasadas do relay.
- O host vencedor leva **sua própria porta**; HTTP em `p+1` implica WS em `p+2`.
  Entrada somente de porta passa pelo fluxo que efetivamente conecta. Mantidas
  duplas Desktop 47080/47081, APK 4980/4981 e legado 7080/7081, portas salvas,
  entrada manual e `moveTo` para múltiplas TVs.
- WebSocket, projeção, mídia, controles e caminhos relativos mantêm o protocolo.
  A ponte nativa não recebe solicitações do relay.

Portas arbitrárias não são adivinhadas: sem anúncio de serviço/porta pelo Desktop,
é necessário informar/salvar a porta ou receber `moveTo`. A busca continua /24,
como antes. Descoberta IPv6, VLANs e máscara de rede variável não foram adicionadas.

Não foi necessário modificar outro repositório. Uma alternativa no Desktop seria
fornecer CORS para GET `/status` (inclusive origem `null` dos assets), com resposta
mínima não sensível; isso não elimina sozinho as restrições de acesso de `file:` da
WebView. Descoberta de qualquer porta desconhecida exigiria anúncio de serviço ou
endpoint fixo que anuncie as portas. Essas mudanças não foram realizadas.

## Testes e reprodução

Resultados locais em 14/11/2026:

- `node --test tests/*.test.mjs`: **54 aprovados**, nenhum ignorado.
- `node --test tests/browser-local-connection.mjs`: **1 aprovado** com Chrome real.
- `flutter test`: **3 aprovados**, incluindo HTTP nativo real.
- `flutter analyze --no-fatal-infos`: **exit 0**; apenas aviso de depreciação do
  import Material preexistente, emitido pelo Flutter 3.50.0. Nenhum erro/warning.
- Paridade byte a byte e sintaxe de **todos** os scripts inline: aprovadas.
- APK/CI, integração Android e aceite físico TCL: **pendentes**.

```powershell
node --test tests/*.test.mjs
node --test tests/browser-local-connection.mjs
cd androidtv
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```

O teste Chromium usa Chrome instalado (`CHROME_BIN` pode indicar outro caminho),
perfil temporário exclusivo, HTTP/WS reais e nenhuma flag que desligue segurança.
Os testes Dart usam HttpServer/HttpClient reais em interface IPv4 privada. Não são
testes da WebView Android. A suíte de integração abaixo usa o widget de produção,
o canal real e WebView do aparelho, com servidores de teste dentro do Android:

```powershell
cd androidtv
flutter test integration_test/local_connection_test.dart -d 192.168.18.20:5555
```

Execute em rede de teste isolada, sem outro sender com prioridade na busca.
Requer portas 47080/47081 livres no aparelho e instalação sem host/relay salvo.
Esse teste não substitui o aceite com PIANO LouvorJA Desktop real.

### Compilação diagnóstica e teste físico

Não há Android SDK instalado neste computador. A tentativa de build local parou
com `No Android SDK found`. CI foi preparado, mas não executado: envio remoto
depende de autorização do usuário. Não há APK novo validado nesta entrega.

Em ambiente com Flutter, JDK e Android SDK configurados:

```powershell
cd androidtv
flutter pub get
flutter analyze --no-fatal-infos
flutter test
flutter build apk --release --build-number=14 --dart-define=PALCO_NETWORK_DIAGNOSTICS=true
adb connect 192.168.18.20:5555
adb -s 192.168.18.20:5555 install -r build/app/outputs/flutter-apk/app-release.apk
adb -s 192.168.18.20:5555 shell dumpsys package com.piano.louvorja.palco_androidtv
adb -s 192.168.18.20:5555 shell am start -n com.piano.louvorja.palco_androidtv/.MainActivity
adb -s 192.168.18.20:5555 logcat -v time flutter:I '*:S'
```

O override produz `0.4.0+14`, distinguindo a instalação da base atual. Use uma
assinatura compatível com a instalada; não desinstale/apague dados automaticamente.
O CI normal usa a versão do pubspec; para um APK diagnóstico pelo CI, será preciso
aplicar os mesmos argumentos de build antes de autorizar o envio.

Com diagnóstico ativado, **uma** consulta browser é comparada ao status nativo
bem-sucedido. Ela não decide a conexão. Observe:

| Log | Significado |
| --- | --- |
| `origin_file`, `receiver_ready`, IPv4 informado | Asset, script principal e bootstrap carregaram. |
| `local_ip_missing`, `receiver_missing`, `bootstrap_failed` | Falha anterior à descoberta. |
| `native_http_ok IP:porta`, `native_ok`, `port_found` | HTTP nativo alcançou e identificou um sender. |
| `native_timeout`, `native_socket`, `native_http_status`, `native_invalid_json`, `native_invalid_status` | Diferenciam timeout, transporte, HTTP e protocolo. |
| `browser=cors` ou `browser=mixed_content` | Categoria explicitamente reportada pelo Chromium. |
| `browser_status_blocked_or_network` com HTTP nativo OK | Diferença entre transportes; isoladamente ainda não prova CORS. |
| `ws_open` | Handshake WebSocket realizado pela TV. |
| `ws_constructor`, `ws_handshake_timeout`, `ws_handshake_or_transport`, `ws_close:1006` | Falhas no caminho WS, não na obtenção do IP. |
| `javascript_error:linha`, `javascript_rejection`, `ws_message_error` | Erro JS/execução/protocolo, sem conteúdo sensível no log. |

O erro ADB **10013** ocorreu tanto pela ferramenta quanto no terminal do usuário,
antes de conectar à TCL. Não é evidência de defeito no Receiver. Resolver o acesso
ADB do computador/rede e repetir; o teste físico permanece **pendente**.
A nova consulta ao Desktop informado também não alcançou `/status` nesta sessão;
os resultados do ambiente original são os fornecidos pelo usuário, não uma nova
medição do Desktop v1.36.0.

Aceite: Desktop v1.36.0 `192.168.18.12`, TCL `192.168.18.20`, descoberta sem entrada
manual, `ws_open`, projeção, imagens/vídeo/áudio, queda/reinício do Desktop,
reconexão, mudança de IP, slot/porta configurável e `moveTo`, host manual e relay.
Repetir regressão em LG/Samsung; manter Issue aberta até aceite físico.

## Riscos e proposta GitHub

- Android: ponte pequena e restrita, mas firmware/WebView e desempenho dos lotes
  exigem teste na TCL. Um firmware pode ter outra restrição WS, agora observável.
- LG/Samsung: não usam a ponte; timeout, cancelamento e seleção de porta são
  compartilhados e precisam de regressão em hardware.
- Relay: mantém fetch/WS originais; resultados antigos não podem substituir a
  conexão local. Teste real do serviço permanece pendente. A seleção preexistente
  de endpoint de desenvolvimento para `file:` não foi alterada neste escopo.
- Dependências: `integration_test` vem do SDK Flutter; o lockfile foi resolvido
  com Flutter 3.50.0/Dart 3.14.0, incluindo versões de testes fixadas pelo SDK.

Commit proposto: `fix(androidtv): discover LAN senders through bounded native status probes`

PR proposto → `staging`: **fix(androidtv): corrigir descoberta local e diagnosticar conexão na TV**

Descrição: A descoberta usava fetch de uma origem file para um servidor sem CORS,
descartava erros e aguardava hosts sem prazo. Android passa a consultar somente
status via HTTP nativo limitado; os Receivers selecionam host/porta atomicamente
e descartam operações antigas. Inclui reprodução CORS e WS reais, testes nativos
e procedimento de aceite TCL. **Refs #43** (não usar `Closes`/`Fixes`).

Condições antes de merge: checks do PR/build APK aprovados e teste físico TCL
aprovado. Esta entrega não autoriza push, criação do PR ou merge.
