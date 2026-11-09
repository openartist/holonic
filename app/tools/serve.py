#!/usr/bin/env python3
"""Static file server with caching turned off, for iterating on the page.

Plain `python3 -m http.server` lets the browser reuse a stale stylesheet or
module after an edit. This sends no-store on every response so a reload always
shows the current files.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8517
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving http://127.0.0.1:{port}/ (no-store)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
