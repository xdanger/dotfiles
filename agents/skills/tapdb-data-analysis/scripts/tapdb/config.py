"""TapDB 端点配置与认证。"""

import json
import os
import sys

BUILTIN_ENDPOINTS = {
    "cn": "https://www.tapdb.com/api",
    "sg": "https://console.ap-sg.tapdb.developer.taptap.com/api",
}

# TapDB 2.0 事件分析 API 端点 (evtapi)
EVTAPI_ENDPOINTS = {
    "cn": "https://www.tapdb.com/evtapi",
    "sg": "https://console.ap-sg.tapdb.developer.taptap.com/evtapi",
}

# Ad-Plus API 端点 (skills 下载等)
ADPLUS_ENDPOINTS = {
    "cn": "https://www.tapdb.com/ad-plus/api",
    "sg": "https://console.ap-sg.tapdb.developer.taptap.com/ad-plus/api",
}


REGION_KEY_VARS = {
    "cn": "TAPDB_MCP_KEY_CN",
    "sg": "TAPDB_MCP_KEY_SG",
}

DEFAULT_REGION_ENV_VARS = (
    "TAPDB_REGION",
    "TAPDB_MCP_REGION",
)

# 常见错误 region 值的模糊映射（防止 LLM 传 domestic/overseas 导致崩溃）
_REGION_ALIASES = {
    "domestic": "cn",
    "internal": "cn",
    "mainland": "cn",
    "china": "cn",
    "cn": "cn",
    "overseas": "sg",
    "oversea": "sg",
    "sg": "sg",
    "global": "sg",
    "international": "sg",
    "海外": "sg",
    "国内": "cn",
}


def normalize_region(region):
    """规范化 region 参数：将常见别名映射为 cn/sg，无法识别时 return None。"""
    if region is None:
        return None
    key = region.strip().lower()
    mapped = _REGION_ALIASES.get(key)
    if mapped:
        return mapped
    # 允许直接传 cn/sg（已命中上方字典），其余不识别的返回 None
    return None


def default_region():
    """Return the CLI default region from public env vars, falling back to cn."""
    for env_var in DEFAULT_REGION_ENV_VARS:
        region = normalize_region(os.environ.get(env_var))
        if region:
            return region
    return "cn"


def _resolve(region, endpoints):
    """通用配置解析: 返回 (key, base_url)。"""
    raw = region
    region = normalize_region(region or "cn")
    if region is None:
        print(f"错误: 不支持的区域 '{raw}'，可选: cn, sg", file=sys.stderr)
        print("提示: 'domestic' → cn, 'overseas' → sg", file=sys.stderr)
        sys.exit(1)
    base_url = endpoints.get(region)
    if not base_url:
        print(f"错误: 不支持的区域 '{region}'，可选: cn, sg", file=sys.stderr)
        sys.exit(1)
    env_var = REGION_KEY_VARS[region]
    key = os.environ.get(env_var)
    if not key:
        print(
            json.dumps(
                {
                    "error": True,
                    "error_kind": "missing_credentials",
                    "region": region,
                    "environment_variable": env_var,
                    "message": f"缺少 TapDB（{region}）认证环境变量 {env_var}",
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(1)
    return key, base_url


def get_config(region):
    return _resolve(region, BUILTIN_ENDPOINTS)


def get_adplus_config(region):
    """获取 ad-plus API 配置（base_url + key）。"""
    return _resolve(region, ADPLUS_ENDPOINTS)


def adplus_headers(key):
    return {
        "MCP-KEY": key,
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
    }


def get_evtapi_config(region):
    """获取 evtapi 基础 URL 和 MCP-KEY。"""
    return _resolve(region, EVTAPI_ENDPOINTS)
