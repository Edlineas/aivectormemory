import io
import types

import aivectormemory.__main__ as main_module


class FakeUtf8Stream:
    def __init__(self):
        self.encoding = "utf-8"
        self.buffer = io.BytesIO()


class FakeBinaryBackedStream:
    def __init__(self, encoding=None):
        self.encoding = encoding
        self.buffer = io.BytesIO()


def test_ensure_utf8_stdio_handles_none_encoding(monkeypatch):
    stdin = FakeBinaryBackedStream(encoding=None)
    stdout = FakeBinaryBackedStream(encoding="utf-8")
    stderr = FakeBinaryBackedStream(encoding="utf-8")

    monkeypatch.setattr(main_module.sys, "stdin", stdin)
    monkeypatch.setattr(main_module.sys, "stdout", stdout)
    monkeypatch.setattr(main_module.sys, "stderr", stderr)

    main_module._ensure_utf8_stdio()

    assert (
        getattr(main_module.sys.stdin, "encoding", None).lower().replace("-", "")
        == "utf8"
    )


def test_ensure_utf8_stdio_skips_stream_without_buffer(monkeypatch):
    stream_without_buffer = types.SimpleNamespace(encoding=None)
    stdout = FakeBinaryBackedStream(encoding="utf-8")
    stderr = FakeBinaryBackedStream(encoding="utf-8")

    monkeypatch.setattr(main_module.sys, "stdin", stream_without_buffer)
    monkeypatch.setattr(main_module.sys, "stdout", stdout)
    monkeypatch.setattr(main_module.sys, "stderr", stderr)

    main_module._ensure_utf8_stdio()

    assert main_module.sys.stdin is stream_without_buffer


def test_ensure_utf8_stdio_keeps_existing_utf8_stream(monkeypatch):
    stdin = FakeUtf8Stream()
    stdout = FakeBinaryBackedStream(encoding="utf-8")
    stderr = FakeBinaryBackedStream(encoding="utf-8")

    monkeypatch.setattr(main_module.sys, "stdin", stdin)
    monkeypatch.setattr(main_module.sys, "stdout", stdout)
    monkeypatch.setattr(main_module.sys, "stderr", stderr)

    main_module._ensure_utf8_stdio()

    assert main_module.sys.stdin is stdin
