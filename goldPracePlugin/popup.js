// 策略模式 - 图表渲染策略
class ChartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chartData = null;
    this.paddingLeft = 60;
    this.paddingRight = 20;
    this.paddingTop = 35; // 增加顶部空间，给"交易中"标识留空间
    this.paddingBottom = 45;
    this.setupCanvas();
    this.setupMouseEvents();
  }

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  setupMouseEvents() {
    const tooltip = document.getElementById('tooltip');
    
    this.canvas.addEventListener('mousemove', (e) => {
      // 需要保存实际绘制的数据
      if (!this.renderedData || this.renderedData.length === 0) {
        tooltip.style.display = 'none';
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // 计算图表区域
      const chartWidth = this.width - this.paddingLeft - this.paddingRight;
      const stepX = chartWidth / (this.fullDayDataForRender.length - 1 || 1);
      
      // 找到最近的数据点在fullDayData中的索引
      const fullDayIndex = Math.round((x - this.paddingLeft) / stepX);
      
      if (fullDayIndex >= 0 && fullDayIndex < this.fullDayDataForRender.length) {
        const point = this.fullDayDataForRender[fullDayIndex];
        
        // 只有该点在实际绘制的数据中才显示
        const isRendered = this.renderedData.some(item => item.time === point.time);
        
        if (isRendered && point.price && point.price > 0) {
          // 重绘图表，添加竖线
          this.redrawWithCrosshair(fullDayIndex);
          
          // 显示提示框
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 10) + 'px';
          tooltip.style.top = (e.clientY - 50) + 'px';
          tooltip.innerHTML = `
            <div>时间：${point.time}</div>
            <div>价格：${point.price.toFixed(2)}元/克</div>
          `;
        } else {
          // 没有数据的点，隐藏提示框
          tooltip.style.display = 'none';
        }
      }
    });
    
    this.canvas.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
      // 重绘图表，移除竖线
      if (this.lastRenderMethod === 'fullDay') {
        this.renderFullDay(this.chartData, this.maxPrice, this.isTradingTime, false, -1, this.tradingDate);
      }
    });
  }

  redrawWithCrosshair(dataIndex) {
    if (this.lastRenderMethod === 'fullDay') {
      this.renderFullDay(this.chartData, this.maxPrice, this.isTradingTime, true, dataIndex, this.tradingDate);
    }
  }

  render(data) {
    if (!data || data.length === 0) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const padding = 50; // 增加左侧空间显示价格标签
    const chartWidth = this.width - padding * 2;
    const chartHeight = this.height - padding * 2;
    const stepX = chartWidth / (data.length - 1 || 1);

    // 绘制网格线
    this.ctx.strokeStyle = '#ecf0f1';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(this.width - padding, y);
      this.ctx.stroke();
    }

    // 绘制价格线
    this.ctx.save();
    this.ctx.strokeStyle = '#e17055';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    data.forEach((point, index) => {
      const x = padding + index * stepX;
      const y = padding + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
      
      if (index === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();
    this.ctx.beginPath(); // 清除路径
    this.ctx.restore();

    // 绘制价格标签
    this.ctx.fillStyle = '#2d3436';
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(maxPrice.toFixed(2), padding - 8, padding + 5);
    this.ctx.fillText(minPrice.toFixed(2), padding - 8, padding + chartHeight + 5);
  }

  // 渲染全天数据（上金所API数据）
  renderFullDay(chartData, maxPrice, isTradingTime, showCrosshair = false, crosshairIndex = -1, tradingDate = '') {
    if (!chartData || chartData.length === 0) return;

    // 保存数据和参数用于鼠标交互
    this.chartData = chartData;
    this.maxPrice = maxPrice;
    this.isTradingTime = isTradingTime;
    this.tradingDate = tradingDate;
    this.lastRenderMethod = 'fullDay';
    this.fullDayDataForRender = null;
    this.renderedData = null;

    this.ctx.clearRect(0, 0, this.width, this.height);

    // 过滤数据：只保留有效数据（价格>0）
    let dataToRender = chartData;
    let fullDayData = chartData;
    
    if (isTradingTime) {
      // 交易时段：只过滤出09:00-15:30范围的数据
      fullDayData = chartData.filter(item => {
        return item.time >= '09:00' && item.time <= '15:30';
      });
      
      // 只绘制有价格的点
      let validData = fullDayData.filter(item => item.price > 0);
      
      // 关键：去掉尾部连续相同的值（这些是未更新的占位数据）
      if (validData.length > 1) {
        const lastPrice = validData[validData.length - 1].price;
        let cutIndex = validData.length - 1;
        
        // 从后往前找，找到最后一个价格变化的位置
        for (let i = validData.length - 2; i >= 0; i--) {
          if (validData[i].price !== lastPrice) {
            cutIndex = i + 1; // 保留到这个变化点的下一个
            break;
          }
        }
        
        // 如果尾部有超过5个相同价格的点，说明是占位数据，只保留到变化点
        if (validData.length - cutIndex > 5) {
          dataToRender = validData.slice(0, cutIndex);
          console.log(`📊 交易中 - 去除${validData.length - cutIndex}个尾部占位点，最后有效点: ${dataToRender[dataToRender.length - 1]?.time}`);
        } else {
          dataToRender = validData;
        }
      } else {
        dataToRender = validData;
      }
      
      console.log(`📊 交易中 - 绘制${dataToRender.length}个点，最后一点: ${dataToRender[dataToRender.length - 1]?.time}`);
    } else {
      // 休市：只绘制有价格的点
      dataToRender = chartData.filter(item => item.price > 0);
    }
    
    // 保存用于鼠标交互判断
    this.fullDayDataForRender = fullDayData;
    this.renderedData = dataToRender;

    const prices = dataToRender.length > 0 ? dataToRender.map(d => d.price) : [maxPrice || 920];
    const minPrice = Math.min(...prices);
    const max = maxPrice || Math.max(...prices);
    const priceRange = max - minPrice || 1;

    const chartWidth = this.width - this.paddingLeft - this.paddingRight;
    const chartHeight = this.height - this.paddingTop - this.paddingBottom;
    const stepX = chartWidth / ((fullDayData.length || chartData.length) - 1 || 1); // 使用日盘数据长度

    // 绘制网格线
    this.ctx.strokeStyle = '#ecf0f1';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = this.paddingTop + (chartHeight / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(this.paddingLeft, y);
      this.ctx.lineTo(this.width - this.paddingRight, y);
      this.ctx.stroke();
    }

    // 绘制价格线（只绘制有效数据）
    if (dataToRender.length > 1) { // 至少要有2个点才能画线
      this.ctx.save();
      this.ctx.strokeStyle = '#e17055';
      this.ctx.lineWidth = 2.5;
      this.ctx.lineCap = 'round'; // 圆角端点
      this.ctx.lineJoin = 'round'; // 圆角连接
      this.ctx.beginPath();

      // 绘制折线，不做任何额外连接
      for (let i = 0; i < dataToRender.length; i++) {
        const point = dataToRender[i];
        const posIndex = fullDayData.findIndex(item => item.time === point.time);
        
        if (posIndex === -1) continue;
        
        const x = this.paddingLeft + posIndex * stepX;
        const y = this.paddingTop + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }

      this.ctx.stroke();
      this.ctx.restore();
      
      // 在最后一个点绘制圆形标记和价格
      if (dataToRender.length > 0) {
        const lastPoint = dataToRender[dataToRender.length - 1];
        const lastPosIndex = fullDayData.findIndex(item => item.time === lastPoint.time);
        
        if (lastPosIndex !== -1) {
          const x = this.paddingLeft + lastPosIndex * stepX;
          const y = this.paddingTop + chartHeight - ((lastPoint.price - minPrice) / priceRange) * chartHeight;
          
          // 绘制圆形标记
          this.ctx.fillStyle = '#e17055';
          this.ctx.beginPath();
          this.ctx.arc(x, y, 5, 0, Math.PI * 2);
          this.ctx.fill();
          
          // 白色边框
          this.ctx.strokeStyle = 'white';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
          
          // 智能标注价格位置：如果点在顶部，价格放下方；否则放上方
          this.ctx.fillStyle = '#2d3436';
          this.ctx.font = 'bold 12px sans-serif';
          
          if (y < this.paddingTop + 40) {
            // 点在顶部，价格标注放下方
            this.ctx.textAlign = 'left';
            this.ctx.fillText(lastPoint.price.toFixed(2), x + 10, y + 18);
          } else {
            // 点在中间或底部，价格标注放上方
            this.ctx.textAlign = 'left';
            this.ctx.fillText(lastPoint.price.toFixed(2), x + 10, y - 8);
          }
        }
      }
    }

    // 绘制Y轴价格标签
    this.ctx.fillStyle = '#2d3436';
    this.ctx.font = '13px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(max.toFixed(1), this.paddingLeft - 8, this.paddingTop + 5);
    this.ctx.fillText(minPrice.toFixed(1), this.paddingLeft - 8, this.paddingTop + chartHeight + 5);

    // 绘制X轴时间标签（显示关键时间点）
    this.ctx.textAlign = 'center';
    this.ctx.font = '10px sans-serif';
    this.ctx.fillStyle = '#636e72';
    
    // 使用计算好的交易日期
    const dateStr = tradingDate || `${new Date().getMonth() + 1}/${new Date().getDate()}`;
    
    // 横坐标时间：交易时段只显示日盘时间（09:00-15:30）
    const displayData = isTradingTime ? fullDayData : chartData;
    
    if (displayData.length > 0) {
      const startTime = displayData[0].time || '09:00';
      const midTime = displayData[Math.floor(displayData.length / 2)].time || '12:00';
      const endTime = displayData[displayData.length - 1].time || '15:30';
      
      // 计算X坐标位置
      const startX = this.paddingLeft;
      const midX = this.paddingLeft + chartWidth / 2;
      const endX = this.width - this.paddingRight;
      
      // 绘制时间标签（分两行：日期和时间）
      this.ctx.fillText(dateStr, startX, this.height - 20);
      this.ctx.fillText(startTime, startX, this.height - 8);
      
      this.ctx.fillText(dateStr, midX, this.height - 20);
      this.ctx.fillText(midTime, midX, this.height - 8);
      
      this.ctx.fillText(dateStr, endX, this.height - 20);
      this.ctx.fillText(endTime, endX, this.height - 8);
    }

    // 绘制鼠标悬停的竖线（只在实际绘制的点才显示）
    if (showCrosshair && crosshairIndex >= 0 && crosshairIndex < fullDayData.length) {
      const point = fullDayData[crosshairIndex];
      
      // 检查该点是否在实际绘制的数据中
      const isRendered = dataToRender.some(item => item.time === point.time && item.price === point.price);
      
      if (isRendered && point.price && point.price > 0) {
        const x = this.paddingLeft + crosshairIndex * stepX;
        const y = this.paddingTop + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        
        // 绘制虚线竖线
        this.ctx.strokeStyle = 'rgba(99, 110, 114, 0.6)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.paddingTop);
        this.ctx.lineTo(x, this.paddingTop + chartHeight);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // 绘制悬停点
        this.ctx.fillStyle = '#e17055';
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }

    // 不在图表内绘制交易状态（已移到顶部HTML）
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  const priceEl = document.getElementById('price');
  const dateEl = document.getElementById('date');
  const statusEl = document.getElementById('status');
  const canvas = document.getElementById('chart');
  const renderer = new ChartRenderer(canvas);

  // 显示今天日期
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  dateEl.textContent = dateStr;

  // 价格提醒功能
  const toggleAlertBtn = document.getElementById('toggleAlertBtn');
  const alertSettings = document.getElementById('alertSettings');
  const alertPriceInput = document.getElementById('alertPriceInput');
  const saveAlertBtn = document.getElementById('saveAlertBtn');
  const alertStatusText = document.getElementById('alertStatusText');

  // 加载提醒设置
  const alertData = await chrome.storage.local.get(['alertEnabled', 'alertPrice']);
  let alertEnabled = alertData.alertEnabled || false;
  let alertPrice = alertData.alertPrice || null;

  // 更新UI状态
  function updateAlertUI() {
    if (alertEnabled) {
      toggleAlertBtn.classList.add('active');
      toggleAlertBtn.textContent = '📌 提醒已开启';
      alertSettings.classList.add('active');
      if (alertPrice) {
        alertStatusText.textContent = `提醒价格: ${alertPrice} 元/克`;
      }
    } else {
      toggleAlertBtn.classList.remove('active');
      toggleAlertBtn.textContent = '📌 价格提醒';
      alertSettings.classList.remove('active');
      alertStatusText.textContent = '';
    }
  }

  updateAlertUI();

  // 切换提醒开关
  toggleAlertBtn.addEventListener('click', () => {
    alertEnabled = !alertEnabled;
    chrome.storage.local.set({ alertEnabled });
    updateAlertUI();
  });

  // 保存提醒价格
  saveAlertBtn.addEventListener('click', () => {
    const price = parseFloat(alertPriceInput.value);
    if (price > 0) {
      alertPrice = price;
      chrome.storage.local.set({ alertPrice });
      alertStatusText.textContent = `✅ 提醒价格已设置: ${price} 元/克`;
      alertPriceInput.value = '';
    } else {
      alertStatusText.textContent = '❌ 请输入有效价格';
    }
  });

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getData' });
    
    // 更新交易状态显示
    if (response.isTradingTime) {
      statusEl.textContent = '● 交易中';
      statusEl.className = 'status trading';
    } else {
      statusEl.textContent = '● 已休市';
      statusEl.className = 'status closed';
    }
    
    let displayPrice = null;
    
    // 优先使用 quotations API 的完整折线图数据
    if (response.fullDayData && response.fullDayData.data && response.fullDayData.times) {
      const chartData = response.fullDayData.data
        .map((price, index) => ({
          time: response.fullDayData.times[index],
          price: parseFloat(price)
        }))
        .filter(item => item.price > 0); // 过滤掉无效数据
      
      console.log(`📊 显示完整折线图数据（${chartData.length}个点）`);
      
      renderer.renderFullDay(
        chartData, 
        response.fullDayData.max, 
        response.isTradingTime,
        false,
        -1,
        response.tradingDate
      );
      
      // 关键：从实际绘制的数据中取最后一个点的价格
      if (renderer.renderedData && renderer.renderedData.length > 0) {
        const lastPoint = renderer.renderedData[renderer.renderedData.length - 1];
        displayPrice = lastPoint.price;
        console.log(`📌 显示图表最右端价格: ${displayPrice} (时间: ${lastPoint.time})`);
        
        // 立即更新 background 的价格，确保徽章一致
        chrome.runtime.sendMessage({
          action: 'updateCurrentPrice',
          price: displayPrice
        }, response => {
          console.log(`✅ 已通知background更新徽章为: ${displayPrice}`);
        });
      }
    } else if (response.priceHistory && response.priceHistory.length > 0) {
      // 如果没有API数据，使用历史记录
      console.log('📊 显示历史记录数据');
      renderer.render(response.priceHistory);
      displayPrice = response.priceHistory[response.priceHistory.length - 1].price;
    }
    
    // 显示价格
    if (displayPrice && !isNaN(displayPrice)) {
      priceEl.textContent = displayPrice.toFixed(2) + ' 元/克';
      priceEl.style.color = '#00b894';
    } else if (response.currentPrice) {
      const price = parseFloat(response.currentPrice);
      if (!isNaN(price)) {
        priceEl.textContent = price.toFixed(2) + ' 元/克';
      }
    } else {
      priceEl.textContent = '-- 元/克';
    }
  } catch (error) {
    console.error('加载数据失败:', error);
    priceEl.textContent = '获取失败';
  }
});

