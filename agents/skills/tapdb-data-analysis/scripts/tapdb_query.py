#!/usr/bin/env python3
"""TapDB 数据查询工具 - 通过 TapDB MCP 服务查询游戏运营数据。

支持国内(cn)和海外(sg)两套部署，endpoint 已内置，只需配置认证密钥。
多数运营查询走 /mcp/op/* 代理接口；广告变现走 ad-plus /ad_monet/revenue。

环境变量:
  TAPDB_MCP_KEY_CN    国内认证密钥
  TAPDB_MCP_KEY_SG    海外认证密钥
"""

from tapdb.cli import main

if __name__ == "__main__":
    main()
