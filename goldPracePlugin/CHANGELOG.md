# 更新日志

## v1.0.0 (2024-11-07)

### 核心功能
- 实时显示工商银行黄金价格
- 每秒自动更新
- Canvas 趋势图表
- 本地缓存

### 数据源
- 工商银行 API: `https://papi.icbc.com.cn/wapDynamicPage/goldMarket/accList`
- 字段: `bz`(名称), `zjj`(金价), `upDownRate`(涨跌)
- 更新频率: 1秒

### 技术
- Manifest V3
- 单例模式 + 观察者模式 + 策略模式
- 原生 JavaScript（无依赖）

### 修复
- ✅ API 解析错误
- ✅ 价格范围验证
- ✅ 字段映射（bz/zjj）
- ✅ 更新频率优化

