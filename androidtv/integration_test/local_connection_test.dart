// Run on Android: flutter test integration_test/local_connection_test.dart -d <adb-id>
// Exercises the production widget, bridge, HTTP client and WebView, not substitutes.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:palco_androidtv/local_status_client.dart';
import 'package:palco_androidtv/main.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'asset WebView discovers no-CORS sender and exchanges real WS messages',
    (tester) async {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
      );
      final ip = interfaces
          .expand((i) => i.addresses)
          .firstWhere((a) => LocalStatusClient.isLanAddress(a.address))
          .address;
      final http = await HttpServer.bind(InternetAddress.anyIPv4, 47080);
      final wsServer = await HttpServer.bind(InternetAddress.anyIPv4, 47081);
      final sockets = <WebSocket>[];
      var nativeRequests = 0;
      final hello = Completer<void>();
      http.listen((request) async {
        if (request.uri.path == '/status') {
          if (request.headers.value('origin') == null) nativeRequests++;
          request.response.headers.contentType = ContentType.json;
          // Deliberately no Access-Control-Allow-Origin, matching Desktop evidence.
          request.response.write('{"unlocked":true}');
        } else {
          request.response.statusCode = 404;
        }
        await request.response.close();
      });
      wsServer.listen((request) async {
        if (!WebSocketTransformer.isUpgradeRequest(request)) {
          request.response.statusCode = 404;
          await request.response.close();
          return;
        }
        expect(request.uri.path, '/palco');
        final socket = await WebSocketTransformer.upgrade(request);
        sockets.add(socket);
        socket.listen((data) {
          final dynamic message = jsonDecode(data as String);
          if (message['type'] == 'hello') {
            if (!hello.isCompleted) hello.complete();
            socket.add(
              jsonEncode({
                'v': 2,
                'type': 'identify',
                'name': 'Android LAN test',
              }),
            );
          }
        });
      });
      addTearDown(() async {
        for (final socket in sockets) {
          await socket.close();
        }
        await http.close(force: true);
        await wsServer.close(force: true);
      });
      await tester.pumpWidget(const PalcoTvApp());
      await tester.pump();
      final dynamic state = tester.state(find.byType(ReceiverPage));
      final controller = state.controller as WebViewController;
      await tester.runAsync(() async {
        await hello.future.timeout(const Duration(seconds: 90));
        expect(nativeRequests, greaterThan(0));
        expect(
          await controller.runJavaScriptReturningResult(
            "location.protocol === 'file:'",
          ),
          true,
        );
        // The original browser transport must fail despite HTTP being reachable.
        await controller.runJavaScript('''
        window.__corsResult='pending';
        fetch('http://$ip:47080/status').then(function(r){return r.json()})
          .then(function(){window.__corsResult='readable'})
          .catch(function(){window.__corsResult='blocked'});
      ''');
        var passed = false;
        for (var i = 0; i < 100; i++) {
          passed =
              await controller.runJavaScriptReturningResult(
                "window.__corsResult==='blocked' && document.getElementById('palcoIdentify') !== null",
              ) ==
              true;
          if (passed) break;
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
        expect(
          passed,
          true,
          reason: 'CORS reproduction and real WS rendering must both complete',
        );
      });
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
