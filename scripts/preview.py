"""Loopback-only fixture server; mocks never enter the packaged extension."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def do_GET(self):
        if self.path == '/preview/popup':
            html = (root / 'extension/popup.html').read_text()
            html = html.replace('<head>', '<head><base href="/extension/"><script src="/tests/popup-fixture.js"></script>')
            data, mime = html.encode(), 'text/html; charset=utf-8'
        elif self.path == '/tests/adapter-under-test.js':
            code = (root / 'extension/adapter.js').read_text()
            code = code.replace("location.origin !== 'https://chat.deepseek.com'", "location.origin !== 'http://127.0.0.1:%s'" % self.server.server_port, 1)
            data, mime = code.encode(), 'text/javascript; charset=utf-8'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *_):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
print(f'本地验收：http://127.0.0.1:{port}/tests/browser.html', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
