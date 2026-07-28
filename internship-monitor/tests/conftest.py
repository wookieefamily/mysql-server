import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeSession:
    """Minimal stand-in for requests.Session driven by a URL->payload map."""

    def __init__(self, routes):
        # routes: dict mapping substring -> (payload, status_code)
        self.routes = routes
        self.headers = {}
        self.calls = []

    def _match(self, url):
        for frag, resp in self.routes.items():
            if frag in url:
                return resp
        return ({}, 404)

    def get(self, url, timeout=None, params=None, **kw):
        self.calls.append(("GET", url, params))
        payload, status = self._match(url)
        return FakeResponse(payload, status)

    def post(self, url, json=None, timeout=None, **kw):
        self.calls.append(("POST", url, json))
        payload, status = self._match(url)
        return FakeResponse(payload, status)
