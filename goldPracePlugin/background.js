// 单例模式 - 数据管理器
class GoldPriceManager {
  static instance = null;
  
  constructor() {
    if (GoldPriceManager.instance) {
      return GoldPriceManager.instance;
    }
    this.priceHistory = [];
    this.currentPrice = null;
    this.observers = [];
    this.fullDayData = null; // 存储完整的当日数据
    this.lastAlertPrice = null; // 上次触发提醒时的价格
    this.lastPopupUpdateTime = 0; // popup 最后更新价格的时间
    GoldPriceManager.instance = this;
  }

  // 观察者模式 - 添加观察者
  addObserver(observer) {
    this.observers.push(observer);
  }

  // 通知所有观察者
  notifyObservers() {
    this.observers.forEach(observer => observer.update(this.currentPrice));
  }

  // 策略模式 - 数据获取策略
  async fetchPrice() {
    try {
      const isTrading = isTradingTime();
      
      if (isTrading) {
        // 交易时段：从首页提取实时数据（包括价格和图表数据）
        console.log('📈 交易时段 - 从首页提取当日实时数据');
        if (await this.fetchFromSGEHomePageWithChart()) {
          return;
        }
      } else {
        // 非交易时段：使用 quotations API（前一交易日完整数据）
        console.log('📊 非交易时段 - 调用quotations API获取前一交易日数据');
        if (await this.fetchFromSGE()) {
          return;
        }
      }
      
      // 备用方案
      if (await this.fetchFromICBC()) {
        console.log('✅ 使用工商银行数据');
        return;
      }
      
      // 最后降级
      this.useMockData();
      
    } catch (error) {
      console.error('获取金价失败:', error);
      this.useMockData();
    }
  }

  // 从上金所首页提取实时数据（价格+图表）
  async fetchFromSGEHomePageWithChart() {
    try {
      console.log('🔄 从首页提取当日实时数据...');
      
      const response = await fetch('https://www.sge.com.cn/', {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      
      const html = await response.text();
      
      // 1. 提取价格（早盘价/午盘价）
      const now = new Date();
      const timeInMinutes = now.getHours() * 60 + now.getMinutes();
      const isWupanTime = timeInMinutes >= 13 * 60 + 30 && timeInMinutes <= 15 * 60 + 30;
      
      let price = null;
      if (isWupanTime) {
        const wupanMatch = html.match(/上海金午盘价（元\/克）[\s\S]{0,100}?<span[^>]*class="[^"]*colorRed[^"]*"[^>]*>([0-9.]+)<\/span>/);
        if (wupanMatch && wupanMatch[1] !== '/' && wupanMatch[1] !== '') {
          price = parseFloat(wupanMatch[1]);
          console.log(`✅ 午盘价: ${price}`);
        }
      }
      
      if (!price) {
        const zaopanMatch = html.match(/上海金早盘价（元\/克）[\s\S]{0,100}?<span[^>]*class="[^"]*colorRed[^"]*"[^>]*>([0-9.]+)<\/span>/);
        if (zaopanMatch) {
          price = parseFloat(zaopanMatch[1]);
          console.log(`✅ 早盘价: ${price}`);
        }
      }
      
      // 2. 调用 quotations API 获取当日实时图表数据
      const chartData = await this.fetchSGEQuotations();
      
      if (chartData) {
        // 关键：过滤掉夜盘数据，只保留今天日盘数据（09:00-15:30）
        const dayTradingData = {
          times: [],
          data: [],
          max: chartData.max,
          heyue: chartData.heyue,
          delaystr: chartData.delaystr,
          updateTime: chartData.updateTime
        };
        
        chartData.times.forEach((time, index) => {
          // 只保留 09:00 到 15:30 之间的数据（排除夜盘 20:00-02:30）
          if (time >= '09:00' && time <= '15:30') {
            dayTradingData.times.push(time);
            dayTradingData.data.push(chartData.data[index]);
          }
        });
        
        this.fullDayData = dayTradingData;
        
        // 使用和popup.js完全相同的逻辑：过滤数据，去除尾部重复
        const validData = [];
        for (let i = 0; i < dayTradingData.data.length; i++) {
          const p = parseFloat(dayTradingData.data[i]);
          if (p > 0) {
            validData.push({ time: dayTradingData.times[i], price: p });
          }
        }
        
        let dataToDisplay = validData;
        
        // 去掉尾部连续相同的值（和popup.js完全一致）
        if (validData.length > 1) {
          const lastPrice = validData[validData.length - 1].price;
          let cutIndex = validData.length - 1;
          
          for (let i = validData.length - 2; i >= 0; i--) {
            if (validData[i].price !== lastPrice) {
              cutIndex = i + 1;
              break;
            }
          }
          
          // 如果尾部重复 > 5个，截断
          if (validData.length - cutIndex > 5) {
            dataToDisplay = validData.slice(0, cutIndex);
            console.log(`✅ 去除${validData.length - cutIndex}个重复点`);
          }
        }
        
        // 取最后一个点的价格
        if (dataToDisplay.length > 0) {
          this.currentPrice = dataToDisplay[dataToDisplay.length - 1].price;
          console.log(`✅ 徽章价格: ${this.currentPrice} (${dataToDisplay[dataToDisplay.length - 1].time})`);
        }
        
        this.updateBadge();
        this.saveToStorage();
        return true;
      }
      
      console.warn('⚠️ 首页提取失败');
    } catch (error) {
      console.warn('❌ 首页提取失败:', error.message);
    }
    return false;
  }

  // 从上金所首页提取早盘价/午盘价（仅价格）
  async fetchFromSGEHomePage() {
    try {
      const response = await fetch('https://www.sge.com.cn/', {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      
      const html = await response.text();
      
      // 判断当前是否在午盘时间（13:30-15:30）
      const now = new Date();
      const timeInMinutes = now.getHours() * 60 + now.getMinutes();
      const isWupanTime = timeInMinutes >= 13 * 60 + 30 && timeInMinutes <= 15 * 60 + 30;
      
      // 提取价格
      let price = null;
      
      if (isWupanTime) {
        const wupanMatch = html.match(/上海金午盘价（元\/克）[\s\S]{0,100}?<span[^>]*class="[^"]*colorRed[^"]*"[^>]*>([0-9.]+)<\/span>/);
        if (wupanMatch && wupanMatch[1] !== '/' && wupanMatch[1] !== '') {
          price = parseFloat(wupanMatch[1]);
          console.log(`✅ 提取到午盘价: ${price}`);
        }
      }
      
      if (!price) {
        const zaopanMatch = html.match(/上海金早盘价（元\/克）[\s\S]{0,100}?<span[^>]*class="[^"]*colorRed[^"]*"[^>]*>([0-9.]+)<\/span>/);
        if (zaopanMatch) {
          price = parseFloat(zaopanMatch[1]);
          console.log(`✅ 提取到早盘价: ${price}`);
        }
      }
      
      return price;
    } catch (error) {
      console.warn('❌ 首页提取失败:', error.message);
    }
    return null;
  }

  // quotations API - 获取完整图表数据
  async fetchSGEQuotations() {
    try {
      const response = await fetch('https://www.sge.com.cn/graph/quotations?t=' + Date.now(), {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.sge.com.cn/sjzx/mrhq'
        }
      });
      
      const result = await response.json();
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const validCount = result.data.filter(p => p > 0).length;
        
        // 关键：检查数据日期
        console.log(`📦 quotations API返回:`);
        console.log(`   - delaystr: ${result.delaystr}`);
        console.log(`   - 有效数据点: ${validCount}个`);
        console.log(`   - max: ${result.max}`);
        console.log(`   - 时间范围: ${result.times[0]} 到 ${result.times[result.times.length-1]}`);
        
        return {
          times: result.times || [],
          data: result.data || [],
          max: result.max || Math.max(...result.data.filter(p => p > 0)),
          heyue: result.heyue || 'Au99.99',
          delaystr: result.delaystr || '',
          updateTime: new Date().toISOString()
        };
      }
    } catch (error) {
      console.warn('❌ quotations API失败:', error.message);
    }
    return null;
  }

  // 从工商银行获取实时金价（备用数据源，仅非交易时段）
  async fetchFromICBC() {
    try {
      console.log('🔄 备用：获取工商银行数据...');
      
      // 直接调用工商银行的真实 API
      const response = await fetch('https://papi.icbc.com.cn/wapDynamicPage/goldMarket/accList', {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': 'https://m.icbc.com.cn/mpage/precious-metal/list',
          'Origin': 'https://m.icbc.com.cn',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('📦 工商银行 API 响应:', result);
      
      // 解析真实的 API 数据结构
      if (result.code === 0 && result.data && Array.isArray(result.data)) {
        // 查找"人民币账户黄金"
        const goldProduct = result.data.find(item => {
          const name = item.bz || '';
          return name.includes('人民币') && name.includes('黄金');
        });
        
        if (goldProduct && goldProduct.zjj) {
          const price = parseFloat(goldProduct.zjj);
          
          if (price > 0) {
            // 只在非交易时段才设置价格，交易时段等popup更新
            if (!isTradingTime()) {
              this.currentPrice = price;
              this.updateBadge();
              console.log(`✅ 非交易时段 - 使用工行价格: ${price}`);
            }
            
            this.priceHistory.push({
              time: new Date().toLocaleTimeString(),
              price: price,
              high: price,
              low: price,
              source: 'ICBC_API',
              name: goldProduct.bz || '人民币账户黄金',
              upDownRate: goldProduct.upDownRate || '0'
            });
            
            if (this.priceHistory.length > 100) {
              this.priceHistory.shift();
            }
            
            this.saveToStorage();
            this.notifyObservers();
            
            return true;
          }
        } else {
          console.warn('⚠️ 未找到人民币账户黄金');
          console.log('可用产品:', result.data.map(item => item.bz));
        }
      } else {
        console.warn('⚠️ API 数据格式不符:', result);
      }
      
    } catch (error) {
      console.warn('❌ 工商银行 API 调用失败:', error.message);
    }
    return false;
  }

  // 从上海黄金交易所获取数据（非交易日用）
  async fetchFromSGE() {
    try {
      console.log('🔄 非交易时段 - 获取前一交易日数据...');
      
      const response = await fetch('https://www.sge.com.cn/graph/quotations?t=' + Date.now(), {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.sge.com.cn/sjzx/mrhq'
        }
      });
      
      const result = await response.json();
      console.log('📦 quotations API响应:', result);
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        // 非交易日：取前一交易日的最后一个有效数据
        const validPrices = result.data.filter(p => p > 0);
        if (validPrices.length > 0) {
          this.currentPrice = parseFloat(validPrices[validPrices.length - 1]);
          
          // 保存完整的时间序列数据
          this.fullDayData = {
            times: result.times || [],
            data: result.data || [],
            max: result.max || latestPrice,
            heyue: result.heyue || 'Au99.99',
            delaystr: result.delaystr || '',
            updateTime: new Date().toISOString()
          };
          
          // 更新历史记录（保持原有格式）
          this.priceHistory.push({
            time: new Date().toLocaleTimeString(),
            price: this.currentPrice,
            high: result.max || latestPrice,
            low: Math.min(...result.data.filter(p => p > 0)),
            source: 'SGE',
            name: result.heyue || 'Au99.99'
          });
          
          if (this.priceHistory.length > 100) {
            this.priceHistory.shift();
          }
          
          this.updateBadge();
          this.saveToStorage();
          this.notifyObservers();
          
          console.log(`✅ 成功获取上金所金价: ${this.currentPrice} 元/克 (最高: ${result.max})`);
          return true;
        }
      }
      
      console.warn('⚠️ 上金所 API 数据格式不符:', result);
    } catch (error) {
      console.warn('❌ 上海黄金交易所数据获取失败:', error.message);
    }
    return false;
  }


  useMockData() {
    // 基于实际金价范围的模拟数据（仅供测试）
    const basePrice = 917.0; // 元/克（接近2024年11月工商银行实际价格）
    const variation = Math.random() * 10 - 5;
    this.currentPrice = Math.round((basePrice + variation) * 100) / 100;
    
    this.priceHistory.push({
      time: new Date().toLocaleTimeString(),
      price: this.currentPrice,
      high: this.currentPrice + Math.random() * 2,
      low: this.currentPrice - Math.random() * 2,
      source: 'MOCK'
    });
    
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }
    
    this.updateBadge();
    this.saveToStorage();
    this.notifyObservers();
    
    console.warn('⚠️ 使用模拟数据 - 无法获取实时数据，请检查网络连接');
  }

  updateBadge() {
    if (this.currentPrice) {
      chrome.action.setBadgeText({ 
        text: Math.round(this.currentPrice).toString()
      });
      chrome.action.setBadgeBackgroundColor({ 
        color: '#FFD700' 
      });
      
      // 检查价格提醒
      this.checkPriceAlert();
    }
  }

  async checkPriceAlert() {
    const data = await chrome.storage.local.get(['alertEnabled', 'alertPrice', 'lastAlertTriggered']);
    
    if (data.alertEnabled && data.alertPrice && this.currentPrice) {
      const alertPrice = parseFloat(data.alertPrice);
      
      // 当前价格低于设定价格时提醒
      if (this.currentPrice < alertPrice) {
        // 避免重复提醒（同一价格区间只提醒一次）
        if (!data.lastAlertTriggered || data.lastAlertTriggered !== alertPrice) {
          // 发送通知
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: '🔔 金价提醒',
            message: `当前金价: ${this.currentPrice.toFixed(2)} 元/克\n已低于您设定的 ${alertPrice} 元/克`,
            priority: 2
          });
          
          // 记录已触发，避免重复
          chrome.storage.local.set({ lastAlertTriggered: alertPrice });
          
          console.log(`🔔 价格提醒触发: 当前 ${this.currentPrice} < 设定 ${alertPrice}`);
        }
      } else {
        // 价格回升到设定值以上，重置提醒状态
        if (data.lastAlertTriggered === alertPrice) {
          chrome.storage.local.set({ lastAlertTriggered: null });
        }
      }
    }
  }

  async saveToStorage() {
    await chrome.storage.local.set({
      currentPrice: this.currentPrice,
      priceHistory: this.priceHistory,
      fullDayData: this.fullDayData
    });
  }

  async loadFromStorage() {
    const data = await chrome.storage.local.get(['currentPrice', 'priceHistory', 'fullDayData']);
    if (data.currentPrice) {
      // 确保 currentPrice 是数字类型
      this.currentPrice = parseFloat(data.currentPrice);
      this.priceHistory = data.priceHistory || [];
      this.fullDayData = data.fullDayData || null;
      this.updateBadge();
    }
  }
}

// 初始化管理器
const manager = new GoldPriceManager();

// 启动时加载数据
manager.loadFromStorage().then(() => {
  manager.fetchPrice();
});

// 每秒自动更新一次（实时性要求）
setInterval(() => {
  manager.fetchPrice();
}, 1000); // 1秒 = 1000毫秒

// 判断是否在交易时间
function isTradingTime() {
  const now = new Date();
  const day = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // 周末不交易
  if (day === 0 || day === 6) {
    return false;
  }
  
  // 日间: 9:00-15:30 (540-930分钟)
  // 夜间: 20:00-次日02:30 (1200分钟-次日150分钟)
  const dayStart = 9 * 60; // 540
  const dayEnd = 15 * 60 + 30; // 930
  const nightStart = 20 * 60; // 1200
  const nightEnd = 2 * 60 + 30; // 150 (次日)
  
  // 日间时段
  if (timeInMinutes >= dayStart && timeInMinutes <= dayEnd) {
    return true;
  }
  
  // 夜间时段（20:00-23:59）
  if (timeInMinutes >= nightStart) {
    return true;
  }
  
  // 夜间时段（00:00-02:30）
  if (timeInMinutes <= nightEnd) {
    return true;
  }
  
  return false;
}

// 获取数据对应的交易日期
function getDataTradingDate() {
  const now = new Date();
  const day = now.getDay();
  const timeInMinutes = now.getHours() * 60 + now.getMinutes();
  
  let targetDate = new Date(now);
  
  // 判断逻辑：
  // 1. 如果当前在交易时间 → 数据是今天的
  if (isTradingTime()) {
    // 交易中，数据就是今天的
    return `${targetDate.getMonth() + 1}/${targetDate.getDate()}`;
  }
  
  // 2. 非交易时间，数据是前一交易日的
  // 周末 → 上周五
  if (day === 0) { // 周日
    targetDate.setDate(now.getDate() - 2);
  } else if (day === 6) { // 周六
    targetDate.setDate(now.getDate() - 1);
  }
  // 周一凌晨 00:00-02:30（夜盘刚结束）→ 还是周五的数据
  else if (day === 1 && timeInMinutes <= 2 * 60 + 30) {
    targetDate.setDate(now.getDate() - 3);
  }
  // 工作日凌晨 00:00-02:30（夜盘刚结束）→ 前一天的数据
  else if (day >= 2 && day <= 5 && timeInMinutes <= 2 * 60 + 30) {
    targetDate.setDate(now.getDate() - 1);
  }
  // 工作日白天非交易时段（15:30-20:00）→ 数据还是今天的（收盘后）
  // else → 今天
  
  return `${targetDate.getMonth() + 1}/${targetDate.getDate()}`;
}

// 监听来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getData') {
    sendResponse({
      currentPrice: manager.currentPrice,
      priceHistory: manager.priceHistory,
      fullDayData: manager.fullDayData,
      isTradingTime: isTradingTime(),
      tradingDate: getDataTradingDate()
    });
  } else if (request.action === 'updateCurrentPrice') {
    // popup 主动更新当前价格（用于徽章显示）- 这是唯一正确的来源
    const price = parseFloat(request.price);
    if (price > 0) {
      manager.currentPrice = price;
      manager.updateBadge();
      manager.saveToStorage();
      console.log(`📌 徽章价格已更新: ${price}`);
    }
    sendResponse({ success: true });
  } else if (request.action === 'updatePrice') {
    // 内容脚本主动发送的金价更新
    console.log('📨 收到内容脚本的金价更新:', request.price);
    
    const price = request.price.buyPrice;
    if (price && price > 0) {
      manager.currentPrice = price;
      manager.priceHistory.push({
        time: new Date().toLocaleTimeString(),
        price: manager.currentPrice,
        high: request.price.sellPrice || price,
        low: price,
        source: request.price.source || 'ICBC_PAGE',
        name: request.price.name || '黄金',
        upDownRate: request.price.upDownRate || '0'
      });
      
      if (manager.priceHistory.length > 100) {
        manager.priceHistory.shift();

      }
      
      manager.updateBadge();
      manager.saveToStorage();
      manager.notifyObservers();
      
      console.log(`✅ 金价已更新: ${price} 元/克 (涨跌: ${request.price.upDownRate}%) (来自 ${request.price.source})`);
      sendResponse({ success: true });
    } else {
      console.warn(`⚠️ 价格数据无效: ${price}`);
      sendResponse({ success: false, error: '价格数据无效: ' + price });
    }
  }
  return true;
});



