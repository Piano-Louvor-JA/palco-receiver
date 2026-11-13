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
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) async {
            final ip = await _localIpv4();

            if (ip == null) {
              debugPrint('[Network] IP local não identificado');
              return;
            }

            try {
              await _controller.runJavaScript(
                '''
                window.__PALCO_LOCAL_IP = "$ip";
                if (typeof window.__palcoLocalIpReady === "function") {
                  window.__palcoLocalIpReady();
                }
                ''',
              );

              debugPrint('[Network] IP informado ao Receiver: $ip');
            } catch (e) {
              debugPrint('[Network] Falha ao informar IP: $e');
            }
          },
        ),
      )
      ..loadFlutterAsset('assets/palco/receiver.html');

    _registerNsd();
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

          final privateIp = ip.startsWith('192.168.') ||
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: WebViewWidget(controller: _controller),
    );
  }
}
