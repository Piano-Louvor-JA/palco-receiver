import 'dart:io';

import 'package:bonsoir/bonsoir.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Palco LouvorJA — Android TV receiver.
///
/// WebView fullscreen com o receiver.html (mesmo arquivo do IPK webOS).
/// NSD anuncia _palco._tcp pra o sender mobile achar a TV por mDNS.
/// D-pad do controle vira KeyboardEvent na WebView (receiver já trata).
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const PalcoTvApp());
}

class PalcoTvApp extends StatelessWidget {
  const PalcoTvApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Palco LouvorJA',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0E1A),
      ),
      home: const ReceiverPage(),
    );
  }
}

class ReceiverPage extends StatefulWidget {
  const ReceiverPage({super.key});

  @override
  State<ReceiverPage> createState() => _ReceiverPageState();
}

class _ReceiverPageState extends State<ReceiverPage> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // D-pad só chega ao receiver quando o WebView tem o foco nativo; sem
      // isso as teclas se perdem até alguém tocar na tela (emulador/TV box).
      ..setNavigationDelegate(
        NavigationDelegate(onPageFinished: (_) => _focusWebView()),
      )
      // loadFlutterAsset é o caminho correto pra assets empacotados no APK
      // (loadFile resolve como http://assets/... → ERR_NAME_NOT_RESOLVED,
      // bug diagnosticado no A03/Android em 2026-08-20).
      ..loadFlutterAsset('assets/palco/receiver.html');
    _registerNsd();
  }

  /// Anuncia _palco._tcp — só pra o sender ACHAR a TV (o WS conecta no
  /// sentido TV→celular; porta anunciada é dummy).
  Future<void> _registerNsd() async {
    try {
      final name = await _deviceName();
      final service = BonsoirService(
        name: name,
        type: '_palco._tcp',
        port: 80, // dummy — descoberta only
        attributes: const {'role': 'receiver', 'app': 'louvorja-palco'},
      );
      final broadcast = BonsoirBroadcast(service: service);
      await broadcast.initialize();
      await broadcast.start();
      debugPrint('[NSD] anunciando ${service.name}._palco._tcp');
    } catch (e) {
      debugPrint('[NSD] falhou (não bloqueia o receiver): $e');
    }
  }

  Future<String> _deviceName() async {
    try {
      final host = Platform.localHostname;
      return 'Palco ${host.isEmpty ? 'AndroidTV' : host.split('.').first}';
    } catch (_) {
      return 'Palco AndroidTV';
    }
  }

  /// Leva o foco do Flutter ao WebView (platform view), que então pede o
  /// foco nativo do Android — mesmo efeito do toque na tela.
  void _focusWebView() {
    if (!mounted) return;
    final scope = FocusScope.of(context);
    if (scope.focusedChild == null) scope.nextFocus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: WebViewWidget(controller: _controller),
    );
  }
}
