import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:palco_androidtv/local_status_client.dart';

void main() {
  test(
    'bridge accepts only canonical private IPv4, never URLs or hostnames',
    () {
      for (final ip in [
        '10.0.0.1',
        '172.16.0.2',
        '172.31.255.254',
        '192.168.18.12',
      ]) {
        expect(LocalStatusClient.isLanAddress(ip), isTrue);
      }
      for (final ip in [
        '127.0.0.1',
        '169.254.169.254',
        '8.8.8.8',
        '192.168.1.999',
        '192.168.01.1',
        '172.32.0.1',
        'localhost',
        'http://192.168.1.1',
        '::1',
      ]) {
        expect(LocalStatusClient.isLanAddress(ip), isFalse);
      }
    },
  );

  test(
    'native HTTP reads no-CORS status, bounds failures, redirects, bodies and cancellation',
    () async {
      // Real sockets on a private interface, not a mocked HttpClient.
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
      );
      final addresses = interfaces
          .expand((i) => i.addresses)
          .where((a) => LocalStatusClient.isLanAddress(a.address));
      expect(
        addresses,
        isNotEmpty,
        reason:
            'This network integration test requires a private IPv4 interface',
      );
      final ip = addresses.first.address;
      final server = await HttpServer.bind(ip, 0);
      final client = LocalStatusClient(
        timeout: const Duration(milliseconds: 300),
      );
      addTearDown(() async {
        client.close();
        await server.close(force: true);
      });
      var mode = 'ok';
      final received = <HttpRequest>[];
      server.listen((request) async {
        received.add(request);
        expect(request.uri.path, '/status');
        expect(request.headers.value('authorization'), isNull);
        expect(request.headers.value('cookie'), isNull);
        switch (mode) {
          case 'hang':
            return;
          case 'status':
            request.response.statusCode = 503;
          case 'redirect':
            request.response.statusCode = 302;
            request.response.headers.set(
              'location',
              'http://127.0.0.1/private',
            );
          case 'invalid':
            request.response.write('not JSON');
          case 'schema':
            request.response.write('{"other":true}');
          case 'large':
            request.response.write('x' * 17000);
          default:
            request.response.write(
              '{"unlocked":false,"secret":"never returned"}',
            );
        }
        await request.response.close();
      });
      final success = await client.probe('ok', ip, server.port);
      expect(success, {'kind': 'ok', 'unlocked': false});
      for (final entry in {
        'status': 'http_status',
        'redirect': 'http_status',
        'invalid': 'invalid_json',
        'schema': 'invalid_status',
        'large': 'body_limit',
        'hang': 'timeout',
      }.entries) {
        mode = entry.key;
        expect(
          (await client.probe(mode, ip, server.port))['kind'],
          entry.value,
        );
      }
      final before = received.length;
      expect(
        (await client.probe('bad', '8.8.8.8', server.port))['kind'],
        'invalid_target',
      );
      expect(
        (await client.probe('bad-port', ip, 80))['kind'],
        'invalid_target',
      );
      expect(received.length, before);
      final cancelled = client.probe('cancel', ip, server.port);
      await Future<void>.delayed(const Duration(milliseconds: 30));
      client.cancel('cancel');
      expect((await cancelled)['kind'], isNot('ok'));
    },
  );
}
