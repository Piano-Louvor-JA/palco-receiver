// Real Chromium + real HTTP/WS, without disabling CORS or browser security.
// CHROME_BIN=/path/to/chrome node --test tests/browser-local-connection.mjs
// This does not substitute for the Android WebView/device integration test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { once } from 'node:events'

test('browser CORS reproduction, readable CORS control, real receiver WS handshake and projection', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'palco-browser-'))
  const sockets = new Set()
  let hello = '', statusRequests = 0
  const server = http.createServer((req, res) => {
    if (req.url === '/cors') res.setHeader('Access-Control-Allow-Origin', '*')
    statusRequests++
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ unlocked: true }))
  })
  server.on('connection', socket => {
    socket.on('error', error => { if (error.code !== 'ECONNRESET') throw error })
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
  })
  server.on('upgrade', (request, socket) => {
    assert.equal(request.url, '/palco')
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] +
      '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
    socket.once('data', buffer => {
      let length = buffer[1] & 127, offset = 2
      if (length === 126) { length = buffer.readUInt16BE(2); offset = 4 }
      const mask = buffer.subarray(offset, offset + 4), payload = buffer.subarray(offset + 4, offset + 4 + length)
      hello = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4])).toString()
      const message = Buffer.from(JSON.stringify({ v: 2, type: 'identify', name: 'LAN integration', slotLabel: 'Test' }))
      socket.write(Buffer.concat([Buffer.from([0x81, message.length]), message]))
    })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const port = server.address().port
  let chrome, cdp
  t.after(async () => {
    if (cdp) cdp.close()
    if (chrome && chrome.exitCode === null) { chrome.kill(); await once(chrome, 'exit').catch(() => {}) }
    for (const socket of sockets) socket.destroy()
    server.close()
    // Only the unique temporary directory created above may be removed.
    const actual = await realpath(directory), root = await realpath(tmpdir())
    assert.equal(path.dirname(actual).toLowerCase(), root.toLowerCase())
    assert.ok(path.basename(actual).startsWith('palco-browser-'))
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })
  chrome = spawn(process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--user-data-dir=' + directory, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''
    const deadline = setTimeout(() => reject(Error('Chrome debugger unavailable: ' + output.slice(-1500))), 10000)
    chrome.once('error', reject)
    chrome.once('exit', code => reject(Error('Chrome exited ' + code)))
    chrome.stderr.on('data', data => {
      output += data.toString()
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(deadline); resolve(match[1]) }
    })
  })
  cdp = new WebSocket(endpoint); await once(cdp, 'open')
  let sequence = 0
  const pending = new Map()
  cdp.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id)
      message.error ? reject(Error(message.error.message)) : resolve(message.result)
    }
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    const deadline = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)) }, 10000)
    pending.set(id, { resolve: value => { clearTimeout(deadline); resolve(value) },
      reject: error => { clearTimeout(deadline); reject(error) } })
    cdp.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const harness = path.join(directory, 'origin.html')
  await writeFile(harness, '<!doctype html><title>LAN origin regression</title>')
  await send('Page.navigate', { url: pathToFileURL(harness).href }, sessionId)
  // Wait for navigation without replacing fetch or WebSocket.
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.title') === 'LAN origin regression') break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(await evaluate(`fetch('http://127.0.0.1:${port}/status').then(()=> 'readable',()=> 'blocked')`), 'blocked')
  assert.equal(await evaluate(`fetch('http://127.0.0.1:${port}/cors').then(r=>r.json()).then(j=>j.unlocked)`), true)
  assert.ok(statusRequests >= 2, 'HTTP reached the server even when its body was blocked by CORS')
  const receiver = pathToFileURL(fileURLToPath(new URL('../webos/index.html', import.meta.url)))
  receiver.search = `?host=127.0.0.1&port=${port}`
  await send('Page.navigate', { url: receiver.href }, sessionId)
  let identified = ''
  for (let i = 0; i < 200; i++) {
    identified = await evaluate("document.getElementById('palcoIdentify') ? document.getElementById('palcoIdentify').textContent : ''")
    if (identified.includes('LAN integration')) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(JSON.parse(hello).type, 'hello')
  assert.ok(identified.includes('LAN integration'), 'real receiver must process the WS message')
  assert.ok((await evaluate("document.getElementById('status').textContent")).includes('●'))
})
