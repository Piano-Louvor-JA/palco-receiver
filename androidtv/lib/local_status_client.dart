import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Narrow LAN discovery transport. Never proxies arbitrary URLs or returns bodies.
class LocalStatusClient {
  LocalStatusClient({this.timeout = const Duration(milliseconds: 1200)});

  final Duration timeout;
  final Map<String, HttpClient> _active = {};

  static bool isLanAddress(String ip) {
    final parts = ip.split('.');
    if (parts.length != 4) return false;
    final octets = <int>[];
    for (final part in parts) {
      final value = int.tryParse(part);
      if (value == null || value < 0 || value > 255 || '$value' != part) {
        return false;
      }
      octets.add(value);
    }
    return octets[0] == 10 ||
        (octets[0] == 192 && octets[1] == 168) ||
        (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31);
  }

  Future<Map<String, Object>> probe(String id, String ip, int port) async {
    if (!isLanAddress(ip) || port < 1024 || port > 65535) {
      return {'kind': 'invalid_target'};
    }
    if (_active.length >= 192 || _active.containsKey(id)) {
      return {'kind': 'busy'};
    }
    final client = HttpClient()
      ..connectionTimeout = timeout
      ..findProxy = (_) => 'DIRECT';
    _active[id] = client;
    try {
      return await (() async {
        final request = await client.getUrl(
          Uri(scheme: 'http', host: ip, port: port, path: '/status'),
        );
        request.followRedirects = false;
        final response = await request.close();
        if (response.statusCode != 200) {
          return <String, Object>{
            'kind': 'http_status',
            'status': response.statusCode,
          };
        }
        final bytes = <int>[];
        await for (final chunk in response) {
          bytes.addAll(chunk);
          if (bytes.length > 16384) {
            return <String, Object>{'kind': 'body_limit'};
          }
        }
        final dynamic json = jsonDecode(utf8.decode(bytes));
        // Preserve the existing sender-identification contract: key presence.
        // No value/body from a legacy sender is forwarded to JavaScript.
        if (json is! Map || !json.containsKey('unlocked')) {
          return <String, Object>{'kind': 'invalid_status'};
        }
        return <String, Object>{
          'kind': 'ok',
          'unlocked': json['unlocked'] == true,
        };
      })().timeout(timeout);
    } on TimeoutException {
      return {'kind': 'timeout'};
    } on SocketException catch (error) {
      return {'kind': 'socket', 'code': error.osError?.errorCode ?? 0};
    } on FormatException {
      return {'kind': 'invalid_json'};
    } on HttpException {
      return {'kind': 'http_error'};
    } catch (_) {
      return {'kind': 'transport_error'};
    } finally {
      _active.remove(id);
      client.close(force: true);
    }
  }

  void cancel(String id) => _active.remove(id)?.close(force: true);

  void close() {
    for (final client in _active.values) {
      client.close(force: true);
    }
    _active.clear();
  }
}
