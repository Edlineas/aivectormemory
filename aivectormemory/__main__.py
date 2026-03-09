import argparse
import io
import sys


def _ensure_utf8_stream(stream):
    encoding = getattr(stream, "encoding", None)
    if isinstance(encoding, str) and encoding.lower().replace("-", "") == "utf8":
        return stream
    buffer = getattr(stream, "buffer", None)
    if buffer is None:
        return stream
    return io.TextIOWrapper(buffer, encoding="utf-8")


def _ensure_utf8_stdio():
    """确保 stdin/stdout 使用 UTF-8 编码（Windows pipe 默认可能是 GBK/CP936）"""
    sys.stdin = _ensure_utf8_stream(sys.stdin)
    sys.stdout = _ensure_utf8_stream(sys.stdout)
    sys.stderr = _ensure_utf8_stream(sys.stderr)


def main():
    _ensure_utf8_stdio()
    parser = argparse.ArgumentParser(
        prog="run", description="AIVectorMemory MCP Server"
    )
    parser.add_argument("--project-dir", default=None, help="项目根目录，默认当前目录")
    sub = parser.add_subparsers(dest="command")

    web_parser = sub.add_parser("web", help="启动 Web 看板")
    web_parser.add_argument("--port", type=int, default=9080, help="Web 看板端口")
    web_parser.add_argument(
        "--bind", default="127.0.0.1", help="绑定地址，默认 127.0.0.1"
    )
    web_parser.add_argument(
        "--token",
        default=None,
        help="API 认证 token，启用后所有 API 请求需带 ?token=xxx",
    )
    web_parser.add_argument(
        "--quiet", action="store_true", default=False, help="屏蔽请求日志"
    )
    web_parser.add_argument(
        "--daemon", action="store_true", default=False, help="后台运行（macOS/Linux）"
    )
    web_parser.add_argument("--project-dir", dest="web_project_dir", default=None)

    install_parser = sub.add_parser("install", help="为当前项目配置 MCP")
    install_parser.add_argument(
        "--project-dir", dest="install_project_dir", default=None
    )

    regen_parser = sub.add_parser(
        "regenerate", help="切换语言并重新生成所有项目的规则文件"
    )
    regen_parser.add_argument(
        "--lang", required=True, help="目标语言 (zh-CN/zh-TW/en/es/de/fr/ja)"
    )

    args = parser.parse_args()

    if args.command == "web":
        project_dir = args.web_project_dir or args.project_dir
        from aivectormemory.web.app import run_web

        run_web(
            project_dir=project_dir,
            port=args.port,
            bind=args.bind,
            token=args.token,
            quiet=args.quiet,
            daemon=args.daemon,
        )
    elif args.command == "install":
        project_dir = args.install_project_dir or args.project_dir
        from aivectormemory.install import run_install

        run_install(project_dir)
    elif args.command == "regenerate":
        from aivectormemory.regenerate import run_regenerate

        run_regenerate(args.lang)
    else:
        from aivectormemory.server import run_server

        run_server(project_dir=args.project_dir)


if __name__ == "__main__":
    main()
