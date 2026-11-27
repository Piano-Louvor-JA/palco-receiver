import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:bonsoir/bonsoir.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'local_status_client.dart';

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
  @visibleForTesting
  WebViewController get controller => _controller;
  final _localStatus = LocalStatusClient();
  String _networkSession = '';
  static const _receiverUrl =
      'file:///android_asset/flutter_assets/assets/palco/receiver.html';

  @override
  void initState() {
    super.initState();

    _controller = WebViewController();
    _initializeWebView().catchError((Object _) {
      debugPrint('[PalcoNet] webview_initialization_failed');
    });
    _registerNsd();
  }

  Future<void> _initializeWebView() async {
    // Await channel/delegate registration before any receiver script executes.
    await _controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await _controller.addJavaScriptChannel(
      'PalcoNetwork',
      onMessageReceived: _onNetworkMessage,
    );
    await _controller.setOnConsoleMessage((message) {
      // Browser messages can contain relay tokens/URLs: classify, never copy.
      final text = message.message.toLowerCase();
      if (text.contains('mixed content')) {
        debugPrint('[PalcoNet] browser=mixed_content');
      } else if (text.contains('cors') || text.contains('cross origin')) {
        debugPrint('[PalcoNet] browser=cors');
      } else if (message.level == JavaScriptLogLevel.error) {
        debugPrint('[PalcoNet] browser=javascript_or_resource_error');
      }
    });
    await _controller.addJavaScriptChannel(
      'PalcoDiagnostic',
      onMessageReceived: (message) {
        // Only a small alphabet of structured, non-sensitive diagnostics.
        if (RegExp(r'^[a-z_]+(?::[0-9]{1,6})?$').hasMatch(message.message) &&
            message.message.length < 64) {
          debugPrint('[PalcoNet] ${message.message}');
        }
      },
    );
    await _controller.setNavigationDelegate(
      NavigationDelegate(
        onNavigationRequest: (request) =>
            !request.isMainFrame || request.url == _receiverUrl
            ? NavigationDecision.navigate
            : NavigationDecision.prevent,
        onPageStarted: (_) {
          _networkSession = '';
          _localStatus.close();
        },
        onWebResourceError: (error) {
          debugPrint(
            '[PalcoNet] web_resource code=${error.errorCode} '
            'main=${error.isForMainFrame}',
          );
        },
        onPageFinished: (String url) async {
          if (url != _receiverUrl || !mounted) return;
          _networkSession = List.generate(
            24,
            (_) =>
                Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
          ).join();
          // D-pad só chega ao receiver quando o WebView tem o foco nativo;
          // sem isso as teclas se perdem até alguém tocar na tela
          // (emulador/TV box).
          _focusWebView();

          final ip = await _localIpv4();

          try {
            await _controller.runJavaScript('''
                window.__PALCO_NATIVE_SESSION = ${jsonEncode(_networkSession)};
                window.__PALCO_LOCAL_IP = ${jsonEncode(ip ?? '')};
                window.__PALCO_NETWORK_READY = true;
                window.__PALCO_NETWORK_DIAGNOSTICS = ${const bool.fromEnvironment('PALCO_NETWORK_DIAGNOSTICS')};
                if (window.PalcoDiagnostic) {
                  PalcoDiagnostic.postMessage(location.protocol === 'file:' ? 'origin_file' : 'origin_other');
                  PalcoDiagnostic.postMessage(typeof window.__palcoLocalIpReady === 'function' ? 'receiver_ready' : 'receiver_missing');
                }
                if (typeof window.__palcoLocalIpReady === "function") {
                  window.__palcoLocalIpReady();
                }
                ''');

            debugPrint(
              ip == null
                  ? '[PalcoNet] local_ip_missing'
                  : '[Network] IP informado ao Receiver: $ip',
            );
          } catch (_) {
            debugPrint('[PalcoNet] bootstrap_failed');
          }
        },
      ),
    );
    // loadFlutterAsset é o caminho correto pra assets empacotados no APK
    // (loadFile resolve como http://assets/... → ERR_NAME_NOT_RESOLVED,
    // bug diagnosticado no A03/Android em 2026-08-20).
    await _controller.loadFlutterAsset('assets/palco/receiver.html');
  }

  Future<void> _onNetworkMessage(JavaScriptMessage message) async {
    try {
      if (message.message.length > 512 || _networkSession.isEmpty) return;
      final dynamic data = jsonDecode(message.message);
      if (data is! Map || data['session'] != _networkSession) return;
      final id = data['id'];
      if (id is! String || !RegExp(r'^[0-9]{1,12}$').hasMatch(id)) return;
      if (data['op'] == 'cancel') {
        _localStatus.cancel('$_networkSession:$id');
        return;
      }
      if (data['op'] != 'status' ||
          data['ip'] is! String ||
          data['port'] is! int) {
        return;
      }
      final session = _networkSession;
      final result = await _localStatus.probe(
        '$session:$id',
        data['ip'] as String,
        data['port'] as int,
      );
      if (!mounted || session != _networkSession) return;
      // Do not log bodies, credentials, or arbitrary JavaScript messages.
      if (result['kind'] == 'ok') {
        debugPrint('[PalcoNet] native_http_ok ${data['ip']}:${data['port']}');
      }
      await _controller.runJavaScript(
        'window.__palcoStatusResult && window.__palcoStatusResult('
        '${jsonEncode(session)},${jsonEncode(id)},${jsonEncode(result)});',
      );
    } catch (_) {
      debugPrint('[PalcoNet] bridge_error');
    }
  }

  @override
  void dispose() {
    _networkSession = '';
    _localStatus.close();
    super.dispose();
  }

  Future<String?> _localIpv4() async {
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
      );

      String? fallback;

      for (final network in interfaces) {
        for (final address in network.addresses) {
          final ip = address.address;

          final privateIp =
              ip.startsWith('192.168.') ||
              ip.startsWith('10.') ||
              RegExp(r'^172\.(1[6-9]|2\d|3[01])\.').hasMatch(ip);

          if (!privateIp) continue;

          final name = network.name.toLowerCase();
          if (name.startsWith('wlan') ||
              name.startsWith('eth') ||
              name.startsWith('en')) {
            return ip;
          }

          fallback ??= ip;
        }
      }

      return fallback;
    } catch (e) {
      debugPrint('[Network] Falha ao identificar IP local: $e');
      return null;
    }
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
    return Scaffold(body: WebViewWidget(controller: _controller));
  }
}
