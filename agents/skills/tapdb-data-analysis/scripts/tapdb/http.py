"""HTTP 请求与输出工具函数。"""

from functools import lru_cache

import json
import os
import random
import ssl
import sys
import time
import urllib.error
import urllib.request


def _is_rate_limited_error(status, message):
    if status == 429:
        return True
    return "MCP查询已达到最大并发查询数" in str(message or "")


def _certifi_ca_file():
    """Return certifi's CA bundle when the optional package is available."""
    try:
        import certifi
        path = certifi.where()
    except (ImportError, OSError):
        return None
    return path if path and os.path.isfile(path) else None


@lru_cache(maxsize=1)
def get_ssl_context():
    """Build a verified TLS context, falling back to certifi only when needed."""
    configured = os.environ.get("SSL_CERT_FILE")
    try:
        context = ssl.create_default_context()
    except Exception as e:
        suffix = f" (SSL_CERT_FILE={configured})" if configured else ""
        raise RuntimeError(f"TLS CA 配置无法加载{suffix}: {e}") from e

    try:
        has_default_ca = context.cert_store_stats().get("x509_ca", 0) > 0
    except (AttributeError, NotImplementedError, ssl.SSLError):
        # Some SSL backends do not expose store statistics. Keep their system
        # context instead of replacing a potentially valid platform trust store.
        has_default_ca = True
    if has_default_ca:
        return context
    if configured:
        raise RuntimeError(f"TLS CA 配置无法加载 (SSL_CERT_FILE={configured})")

    certifi_path = _certifi_ca_file()
    if certifi_path:
        try:
            return ssl.create_default_context(cafile=certifi_path)
        except Exception as e:
            raise RuntimeError(f"TLS CA 配置无法加载 (certifi={certifi_path}): {e}") from e
    return context


def open_url(request, *, timeout=120):
    """Open a URL with the shared verified TLS context."""
    url = getattr(request, "full_url", str(request))
    if str(url).lower().startswith("https://"):
        return urllib.request.urlopen(request, timeout=timeout, context=get_ssl_context())
    return urllib.request.urlopen(request, timeout=timeout)


def is_certificate_error(reason):
    current = reason
    seen = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        text = str(current).lower()
        if isinstance(current, ssl.SSLCertVerificationError) or any(
            marker in text
            for marker in (
                "certificate_verify_failed",
                "certificate verify failed",
                "unable to get local issuer certificate",
                "tls ca 配置无法加载",
            )
        ):
            return True
        current = getattr(current, "reason", None) or getattr(current, "__cause__", None)
    return False


def connection_error(reason):
    """Return an actionable connection error payload without credentials."""
    if is_certificate_error(reason):
        payload = {
            "error": True,
            "code": "certificate_verify_failed",
            "message": "TLS 证书校验失败：Python 未能加载可用 CA 或无法验证服务端证书。",
            "hint": (
                "请先修复 Python/系统证书；也可安装 certifi 后设置 "
                "SSL_CERT_FILE=$(python3 -m certifi)。不要关闭 TLS 证书校验。"
            ),
            "detail": str(reason),
        }
        configured = os.environ.get("SSL_CERT_FILE")
        if configured:
            payload["ssl_cert_file"] = configured
    else:
        payload = {"error": True, "message": f"连接失败: {reason}"}
    return payload


def http_request(method, url, headers, body=None, max_retries=12):
    headers = dict(headers or {})
    if not any(k.lower() == "user-agent" for k in headers):
        headers["User-Agent"] = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    data = json.dumps(body).encode("utf-8") if body else None

    def _backoff_ms(attempt: int) -> float:
        """Exponential backoff with jitter: base 1s, max 30s."""
        base = min(1.0 * (2 ** attempt), 30.0)
        return base * (0.5 + random.random() * 0.5)  # 50-100% of base

    # 初始抖动：在第一个请求前等待 0~500ms 随机延迟，
    # 让同一时刻的并行请求错开，减少并发冲突概率。
    initial_jitter = random.random() * 0.5  # 0~500ms
    time.sleep(initial_jitter)

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            if data:
                req.add_header("Content-Type", "application/json")
            with open_url(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            last_error = {
                "error": True,
                "status": e.code,
                "message": err_body,
            }
            if not _is_rate_limited_error(e.code, err_body) or attempt >= max_retries:
                return last_error
            delay = _backoff_ms(attempt)
            time.sleep(delay)
        except urllib.error.URLError as e:
            return connection_error(e.reason)
        except Exception as e:
            if is_certificate_error(e):
                return connection_error(e)
            return {"error": True, "message": str(e)}
    return last_error or {"error": True, "message": "请求失败"}


def output(data, *, exit_code=None):
    print(json.dumps(data, ensure_ascii=False, indent=2))
    if exit_code is not None:
        sys.exit(exit_code)
