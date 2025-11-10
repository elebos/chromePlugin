// 内容脚本 - 从工商银行页面提取金价数据
(function() {
  console.log('✅ 金价插件内容脚本已注入');
  
  let capturedData = null;
  
  // 拦截 Fetch 请求
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    
    // 拦截金价相关的 API 请求
    if (url.includes('goldMarket') || url.includes('precious') || url.includes('accList')) {
      console.log('🎯 拦截到金价 API 请求:', url);
      
      return originalFetch.apply(this, args).then(response => {
        // 克隆响应以便我们可以读取数据
        const clonedResponse = response.clone();
        
        clonedResponse.json().then(data => {
          console.log('📦 拦截到 API 响应数据:', data);
          capturedData = {
            url: url,
            data: data,
            timestamp: new Date().toISOString()
          };
          
          // 立即解析并发送金价
          const goldPrice = parseGoldPrice(data);
          if (goldPrice) {
            sendPriceToBackground(goldPrice);
          }
        }).catch(err => {
          console.warn('解析响应失败:', err);
        });
        
        return response;
      });
    }
    
    return originalFetch.apply(this, args);
  };
  
  // 拦截 XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    
    xhr.open = function(method, url, ...rest) {
      this._url = url;
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    
    xhr.send = function(...args) {
      if (this._url && (this._url.includes('goldMarket') || this._url.includes('precious') || this._url.includes('accList'))) {
        console.log('🎯 拦截到 XHR 金价请求:', this._url);
        
        this.addEventListener('load', function() {
          try {
            const data = JSON.parse(this.responseText);
            console.log('📦 拦截到 XHR 响应数据:', data);
            capturedData = {
              url: this._url,
              data: data,
              timestamp: new Date().toISOString()
            };
            
            const goldPrice = parseGoldPrice(data);
            if (goldPrice) {
              sendPriceToBackground(goldPrice);
            }
          } catch (err) {
            console.warn('解析 XHR 响应失败:', err);
          }
        });
      }
      
      return originalSend.apply(this, args);
    };
    
    return xhr;
  };
  
  // 解析金价数据 - 基于真实的工商银行 API 结构
  function parseGoldPrice(data) {
    try {
      console.log('📦 开始解析 API 数据:', data);
      
      // 工商银行 API 返回结构: { code: 0, message: "success", data: [...] }
      if (data.code === 0 && data.data && Array.isArray(data.data)) {
        console.log('📋 产品列表 (共', data.data.length, '个):', data.data);
        
        // 查找"人民币账户黄金"
        const goldProduct = data.data.find(item => {
          const name = item.bz || ''; // bz 是产品名称字段
          return name.includes('人民币') && name.includes('黄金');
        });
        
        if (goldProduct) {
          console.log('✅ 找到黄金产品:', goldProduct);
          
          // zjj 是中间价字段（金价）
          const price = parseFloat(goldProduct.zjj || 0);
          
          if (price > 0) {
            const result = {
              name: goldProduct.bz || '人民币账户黄金',
              buyPrice: price,
              sellPrice: price, // 工商银行只提供中间价
              upDownRate: goldProduct.upDownRate || '0',
              textColor: goldProduct.textColor || '',
              timestamp: new Date().toISOString(),
              source: 'ICBC_PAGE'
            };
            console.log('✅ 解析成功:', result);
            return result;
          } else {
            console.warn('⚠️ 价格数据无效:', price);
          }
        } else {
          console.warn('⚠️ 未找到人民币账户黄金');
          console.log('可用产品:', data.data.map(item => item.bz));
        }
      } else {
        console.warn('⚠️ API 数据格式不匹配');
      }
    } catch (error) {
      console.error('❌ 解析金价失败:', error);
    }
    return null;
  }
  
  // 从页面 DOM 中提取金价（备用方案）
  function extractFromDOM() {
    console.log('🔍 尝试从 DOM 提取金价...');
    
    // 方法1: 查找包含"人民币账户黄金"和价格的元素
    const elements = document.querySelectorAll('*');
    for (let elem of elements) {
      const text = elem.textContent;
      if ((text.includes('人民币') && text.includes('黄金')) || text.includes('账户黄金')) {
        // 查找附近的价格
        const priceMatch = text.match(/(\d{3,4}\.\d{2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          if (price > 0) {
            console.log('✅ 从 DOM 提取到金价:', price);
            return {
              name: '人民币账户黄金',
              buyPrice: price,
              sellPrice: price,
              timestamp: new Date().toISOString(),
              source: 'ICBC_DOM'
            };
          }
        }
      }
    }
    
    // 方法2: 查找列表项
    const listItems = document.querySelectorAll('li, .item, .list-item, .product, [class*="list"]');
    for (let item of listItems) {
      const text = item.textContent;
      if ((text.includes('人民币') && text.includes('黄金')) || text.includes('账户黄金')) {
        const priceMatch = text.match(/(\d{3,4}\.\d{2})/g);
        if (priceMatch && priceMatch.length > 0) {
          const price = parseFloat(priceMatch[0]);
          if (price > 0) {
            console.log('✅ 从列表项提取到金价:', price);
            return {
              name: '人民币账户黄金',
              buyPrice: price,
              sellPrice: price,
              timestamp: new Date().toISOString(),
              source: 'ICBC_DOM'
            };
          }
        }
      }
    }
    
    console.warn('⚠️ DOM 提取未找到金价');
    return null;
  }
  
  // 发送金价到 background
  function sendPriceToBackground(goldPrice) {
    console.log('📤 发送金价到 background:', goldPrice);
    chrome.runtime.sendMessage({
      action: 'updatePrice',
      price: goldPrice
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError);
      } else {
        console.log('✅ 金价已更新');
      }
    });
  }
  
  // 监听来自 background 的请求
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 收到 background 消息:', request);
    
    if (request.action === 'extractPrice') {
      // 先尝试返回已拦截的数据
      if (capturedData) {
        const goldPrice = parseGoldPrice(capturedData.data);
        if (goldPrice) {
          sendResponse({ success: true, price: goldPrice });
          return true;
        }
      }
      
      // 否则尝试从 DOM 提取
      const domPrice = extractFromDOM();
      if (domPrice) {
        sendResponse({ success: true, price: domPrice });
        return true;
      }
      
      sendResponse({ success: false, error: '未找到金价数据' });
    }
    
    return true;
  });
  
  // 页面加载完成后，等待一下再尝试提取
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const domPrice = extractFromDOM();
        if (domPrice) {
          sendPriceToBackground(domPrice);
        }
      }, 2000);
    });
  } else {
    setTimeout(() => {
      const domPrice = extractFromDOM();
      if (domPrice) {
        sendPriceToBackground(domPrice);
      }
    }, 2000);
  }
  
  console.log('✅ 金价监听器已就绪');
})();

