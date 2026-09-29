# Palco Receiver — Android TV / box / Fire TV

Variante Android TV do Palco: casca **Flutter** com `WebView` fullscreen
carregando o MESMO receiver (`assets/palco/receiver.html`). Resolve nativo o
que o webOS bloqueia: mDNS e distribuição por **Play Store**.

## Estrutura

```
androidtv/
├── lib/main.dart                    # WebView fullscreen + NSD (bonsoir)
├── assets/palco/receiver.html       # MESMO receiver — paridade validada no CI
│                                    # (diff vs webos/index.html = fail)
├── android/                         # manifest LEANBACK + banner 320x180 (obrigatório TV)
└── pubspec.yaml                     # bump version a CADA build antes de buildar
```

## Build

```bash
cd androidtv/
# bump version no pubspec.yaml ANTES (version: X.Y.Z+N) e commitar
flutter build apk --release
# confirmar a versão ANTES de instalar (APK stale no disco instala "degradado"):
aapt2 dump badging build/app/outputs/flutter-apk/app-release.apk | head -1
```

## Instalar

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
adb shell dumpsys package <pkg> | grep -m1 versionName   # evidência por aparelho
```

- **ADB via Wi-Fi**: parear (`adb pair <ip>:<porta> <código>`) → o device
  reconecta só via mDNS. Multi-device: instalar por serial com retry +
  `dumpsys` em cada um.
- **Fire TV / box genérico**: mesma APK — ativar "Apps de fontes
  desconhecidas" e instalar via `adb install` ou sideload.
- **Distribuição em escala**: Play Store (canal Android TV) — sem os
  bloqueios de launch remoto do webOS/Tizen.

## Pontos de plataforma

- Manifest: `LEANBACK_LAUNCHER` + `LAUNCHER`, landscape, `keepScreenOn`,
  `usesCleartextTraffic` (sender é HTTP), touchscreen NOT required,
  `banner` 320×180.
- NSD anuncia `_palco._tcp` (bonsoir 7.x: campo `attributes:`,
  `await broadcast.initialize()` antes de `start()`) — é só pra o sender
  ACHAR a TV; a conexão continua TV→celular via WS (:7081).
- D-pad funciona sem código extra: WebView entrega KeyEvents como keydown
  e o receiver já trata (OK/back/setas).
- `flutter analyze` no CI: warnings **falham** o job (não só errors) —
  limpar `unused_field`/`unused_local_variable`.

## Conexão

Mesma lógica das outras variantes: o receiver auto-escaneia o sender na
rede (:7080/status) ou IP/porta manual pela tecla vermelha. Assets do
receiver vivem canonicamente em `pianolouvorja-flutter/src/assets/palco/`
e são copiados pra cá no empacotamento — nunca editar só um dos lados.
