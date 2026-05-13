/**
 * 图表渲染工具
 * 基于Chart.js封装常用图表
 */

// 维度名称映射（复制定义，避免跨文件问题）
const DIMENSION_NAMES = {
  perception: '音乐感知力',
  emotion: '情感理解力',
  culture: '文化认知',
  aesthetic: '审美判断',
  expression: '表达规范'
};

/**
 * 渲染雷达图
 */
function renderRadar(canvasId, data, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  const labels = Object.keys(data).map(k => DIMENSION_NAMES[k] || k);
  const values = Object.values(data).map(v => typeof v === 'object' ? v.score : v);
  
  const config = {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: options.label || '得分',
        data: values,
        backgroundColor: options.bgColor || 'rgba(13, 148, 136, 0.2)',
        borderColor: options.borderColor || '#0d9488',
        borderWidth: options.borderWidth || 2,
        pointBackgroundColor: options.pointColor || '#0d9488',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#0d9488'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: options.maintainRatio !== false,
      scales: {
        r: {
          beginAtZero: true,
          max: options.max || 10,
          ticks: {
            stepSize: options.stepSize || 2,
            font: { size: 11 }
          },
          pointLabels: {
            font: { size: options.labelSize || 12 }
          }
        }
      },
      plugins: {
        legend: {
          display: options.showLegend || false,
          position: options.legendPosition || 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${context.raw.toFixed(1)}分`
          }
        }
      },
      ...options.chartOptions
    }
  };
  
  return new Chart(ctx, config);
}

/**
 * 渲染柱状图
 */
function renderBar(canvasId, labels, data, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: options.label || '数据',
        data,
        backgroundColor: options.colors || '#0d9488',
        borderColor: options.borderColors || '#0d9488',
        borderWidth: options.borderWidth || 0,
        borderRadius: options.borderRadius || 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: options.maintainRatio !== false,
      indexAxis: options.indexAxis || 'x',
      scales: {
        x: {
          beginAtZero: true,
          grid: { display: options.showGrid === false ? false : true }
        },
        y: {
          beginAtZero: true,
          max: options.yMax,
          grid: { display: options.showGrid === false ? false : true }
        }
      },
      plugins: {
        legend: {
          display: options.showLegend || false
        }
      },
      ...options.chartOptions
    }
  };
  
  return new Chart(ctx, config);
}

/**
 * 渲染水平柱状图
 */
function renderHorizontalBar(canvasId, labels, data, options = {}) {
  return renderBar(canvasId, labels, data, {
    ...options,
    indexAxis: 'y'
  });
}

/**
 * 渲染折线图
 */
function renderLine(canvasId, labels, datasets, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label || `数据${i + 1}`,
        data: ds.data,
        borderColor: ds.color || '#0d9488',
        backgroundColor: ds.bgColor || 'rgba(13, 148, 136, 0.1)',
        tension: ds.tension || 0.3,
        fill: ds.fill !== false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: options.maintainRatio !== false,
      scales: {
        x: {
          beginAtZero: true,
          grid: { display: options.showGrid === false ? false : true }
        },
        y: {
          beginAtZero: true,
          grid: { display: options.showGrid === false ? false : true }
        }
      },
      plugins: {
        legend: {
          display: options.showLegend !== false,
          position: options.legendPosition || 'bottom'
        }
      },
      ...options.chartOptions
    }
  };
  
  return new Chart(ctx, config);
}

/**
 * 渲染饼图/环形图
 */
function renderPie(canvasId, labels, data, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  
  const defaultColors = [
    '#0d9488', '#6366f1', '#f59e0b', '#22c55e', '#ef4444',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'
  ];
  
  const config = {
    type: options.type || 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: options.colors || defaultColors,
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: options.maintainRatio !== false,
      plugins: {
        legend: {
          display: options.showLegend !== false,
          position: options.legendPosition || 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.raw / total) * 100).toFixed(1);
              return `${context.label}: ${context.raw} (${percentage}%)`;
            }
          }
        }
      },
      cutout: options.type === 'doughnut' ? '50%' : 0,
      ...options.chartOptions
    }
  };
  
  return new Chart(ctx, config);
}

/**
 * 渲染环形图
 */
function renderDoughnut(canvasId, labels, data, options = {}) {
  return renderPie(canvasId, labels, data, {
    ...options,
    type: 'doughnut'
  });
}

/**
 * 渲染得分分布柱状图
 */
function renderScoreDistribution(canvasId, scores, options = {}) {
  // 将分数分段统计
  const ranges = ['0-10', '10-20', '20-30', '30-40', '40-50'];
  const distribution = [0, 0, 0, 0, 0];
  
  scores.forEach(score => {
    if (score <= 10) distribution[0]++;
    else if (score <= 20) distribution[1]++;
    else if (score <= 30) distribution[2]++;
    else if (score <= 40) distribution[3]++;
    else distribution[4]++;
  });
  
  return renderBar(canvasId, ranges, distribution, {
    label: '人数',
    colors: [
      '#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e'
    ],
    ...options
  });
}

/**
 * 渲染趋势图
 */
function renderTrend(canvasId, dates, scores, options = {}) {
  return renderLine(canvasId, dates, [{
    label: options.label || '得分',
    data: scores,
    color: options.color || '#0d9488',
    bgColor: options.bgColor || 'rgba(13, 148, 136, 0.1)'
  }], options);
}

/**
 * 销毁图表实例
 */
function destroyChart(chart) {
  if (chart) {
    chart.destroy();
  }
}

// 导出
window.DIMENSION_NAMES = DIMENSION_NAMES;
window.renderRadar = renderRadar;
window.renderBar = renderBar;
window.renderHorizontalBar = renderHorizontalBar;
window.renderLine = renderLine;
window.renderPie = renderPie;
window.renderDoughnut = renderDoughnut;
window.renderScoreDistribution = renderScoreDistribution;
window.renderTrend = renderTrend;
window.destroyChart = destroyChart;
