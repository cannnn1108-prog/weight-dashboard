/**
 * Chart.js グラフ描画モジュール
 */

const ChartManager = {
  // グラフインスタンスを保持
  charts: {},

  // テーマに応じた色設定
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#06b6d4',
    gray: '#6b7280'
  },

  /**
   * テーマに応じたグリッド色を取得
   */
  getGridColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(107, 114, 128, 0.1)';
  },

  /**
   * テーマに応じたテキスト色を取得
   */
  getTextColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? '#94a3b8' : '#6b7280';
  },

  /**
   * 共通のグラフオプションを取得
   */
  getCommonOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: this.getTextColor(),
            font: { size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: this.getGridColor() },
          ticks: { color: this.getTextColor(), font: { size: 11 } }
        },
        y: {
          grid: { color: this.getGridColor() },
          ticks: { color: this.getTextColor(), font: { size: 11 } }
        }
      }
    };
  },

  /**
   * 体重推移グラフを描画
   */
  renderWeightChart(data) {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;

    if (this.charts.weight) {
      this.charts.weight.destroy();
    }

    // nullを除外して最小値・最大値を計算
    const validData = data.data.filter(d => d !== null);
    const minWeight = Math.min(...validData) - 2;
    const maxWeight = Math.max(...validData) + 2;

    this.charts.weight = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: '体重 (kg)',
            data: data.data,
            borderColor: this.colors.primary,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true
          },
          {
            label: '7日移動平均',
            data: data.movingAvg,
            borderColor: this.colors.secondary,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 0,
            spanGaps: true
          },
          {
            label: '目標体重',
            data: data.targetLine,
            borderColor: this.colors.success,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            pointRadius: 0
          }
        ]
      },
      options: {
        ...this.getCommonOptions(),
        plugins: {
          ...this.getCommonOptions().plugins,
          legend: {
            ...this.getCommonOptions().plugins.legend,
            position: 'top'
          }
        },
        scales: {
          ...this.getCommonOptions().scales,
          y: {
            ...this.getCommonOptions().scales.y,
            min: minWeight,
            max: maxWeight
          }
        }
      }
    });
  },

  /**
   * カロリー推移グラフを描画
   */
  renderCalorieChart(data) {
    const ctx = document.getElementById('calorieChart');
    if (!ctx) return;

    if (this.charts.calorie) {
      this.charts.calorie.destroy();
    }

    // 目標カロリーラインに色をつける（超過は赤、達成は緑）
    const barColors = data.intake.map((cal, i) => {
      if (cal === null) return 'rgba(107, 114, 128, 0.3)';
      const target = data.targetLine[i];
      const diff = cal - target;
      if (diff > 200) return 'rgba(239, 68, 68, 0.7)'; // 大幅超過
      if (diff > 0) return 'rgba(245, 158, 11, 0.7)'; // 少し超過
      return 'rgba(16, 185, 129, 0.7)'; // 達成
    });

    // ツールチップ用にデータを保存
    const intakeData = data.intake;
    const targetData = data.targetLine;

    this.charts.calorie = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: '摂取カロリー',
            data: data.intake,
            backgroundColor: barColors,
            borderColor: barColors.map(c => c.replace('0.7', '1')),
            borderWidth: 1
          },
          {
            label: '目標',
            data: data.targetLine,
            type: 'line',
            borderColor: this.colors.danger,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0
          }
        ]
      },
      options: {
        ...this.getCommonOptions(),
        plugins: {
          ...this.getCommonOptions().plugins,
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              title: (context) => {
                return context[0].label;
              },
              label: (context) => {
                if (context.datasetIndex === 1) {
                  return `目標: ${context.parsed.y.toLocaleString()} kcal`;
                }
                return `摂取: ${context.parsed.y.toLocaleString()} kcal`;
              },
              afterBody: (context) => {
                const index = context[0].dataIndex;
                const intake = intakeData[index];
                const target = targetData[index];

                if (intake === null) return [];

                const diff = intake - target;
                const lines = [];
                lines.push('');

                if (diff > 200) {
                  lines.push(`【過剰】 +${diff.toLocaleString()} kcal`);
                  lines.push('カロリーを抑える工夫が必要');
                } else if (diff > 0) {
                  lines.push(`【やや過剰】 +${diff.toLocaleString()} kcal`);
                  lines.push('少しだけ超過、許容範囲内');
                } else if (diff >= -100) {
                  lines.push(`【適正】 ${diff.toLocaleString()} kcal`);
                  lines.push('良いペースです！');
                } else {
                  lines.push(`【不足】 ${diff.toLocaleString()} kcal`);
                  lines.push('もう少し食べても大丈夫');
                }

                return lines;
              }
            }
          }
        },
        scales: {
          ...this.getCommonOptions().scales,
          y: {
            ...this.getCommonOptions().scales.y,
            beginAtZero: false,
            min: 1500,
            title: {
              display: true,
              text: 'kcal',
              color: this.getTextColor()
            }
          }
        }
      }
    });
  },

  /**
   * PFCバランス円グラフを描画
   */
  renderPFCChart(pfc) {
    const ctx = document.getElementById('pfcChart');
    if (!ctx) return;

    if (this.charts.pfc) {
      this.charts.pfc.destroy();
    }

    this.charts.pfc = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['タンパク質 (P)', '脂質 (F)', '炭水化物 (C)'],
        datasets: [
          {
            data: [pfc.protein, pfc.fat, pfc.carbs],
            backgroundColor: [
              'rgba(59, 130, 246, 0.8)',
              'rgba(245, 158, 11, 0.8)',
              'rgba(16, 185, 129, 0.8)'
            ],
            borderColor: [
              this.colors.primary,
              this.colors.warning,
              this.colors.success
            ],
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: this.getTextColor(),
              font: { size: 12 },
              padding: 15
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.label}: ${context.parsed}%`;
              }
            }
          }
        }
      }
    });
  },

  /**
   * 腹囲推移グラフを描画
   */
  renderWaistChart(data) {
    const ctx = document.getElementById('waistChart');
    if (!ctx) return;

    if (this.charts.waist) {
      this.charts.waist.destroy();
    }

    // データがない場合
    if (!data.data || data.data.length === 0) {
      this.charts.waist = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['データなし'],
          datasets: [{
            data: [0],
            borderColor: 'transparent'
          }]
        },
        options: {
          ...this.getCommonOptions(),
          plugins: {
            ...this.getCommonOptions().plugins,
            title: {
              display: true,
              text: '腹囲データがありません',
              color: this.getTextColor()
            }
          }
        }
      });
      return;
    }

    const minWaist = Math.min(...data.data) - 2;
    const maxWaist = Math.max(...data.data) + 2;

    this.charts.waist = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: '腹囲 (cm)',
            data: data.data,
            borderColor: this.colors.info,
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 6,
            pointHoverRadius: 8
          }
        ]
      },
      options: {
        ...this.getCommonOptions(),
        scales: {
          ...this.getCommonOptions().scales,
          y: {
            ...this.getCommonOptions().scales.y,
            min: minWaist,
            max: maxWaist,
            title: {
              display: true,
              text: 'cm',
              color: this.getTextColor()
            }
          }
        }
      }
    });
  },

  /**
   * 歩数推移グラフを描画
   */
  renderStepsChart(data) {
    const ctx = document.getElementById('stepsChart');
    if (!ctx) return;

    if (this.charts.steps) {
      this.charts.steps.destroy();
    }

    // データがない場合
    if (!data.data || data.data.length === 0 || data.data.every(d => d === null)) {
      this.charts.steps = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['データなし'],
          datasets: [{
            data: [0],
            backgroundColor: 'transparent'
          }]
        },
        options: {
          ...this.getCommonOptions(),
          plugins: {
            ...this.getCommonOptions().plugins,
            title: {
              display: true,
              text: '歩数データがありません',
              color: this.getTextColor()
            }
          }
        }
      });
      return;
    }

    // 目標達成状況に応じた色分け
    const barColors = data.data.map(steps => {
      if (steps === null) return 'rgba(107, 114, 128, 0.3)';
      const target = data.target;
      if (steps >= target) return 'rgba(16, 185, 129, 0.7)'; // 達成
      if (steps >= target * 0.7) return 'rgba(245, 158, 11, 0.7)'; // 70%以上
      return 'rgba(239, 68, 68, 0.7)'; // 未達成
    });

    this.charts.steps = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: '歩数',
            data: data.data,
            backgroundColor: barColors,
            borderColor: barColors.map(c => c.replace('0.7', '1')),
            borderWidth: 1
          },
          {
            label: '目標',
            data: data.targetLine,
            type: 'line',
            borderColor: this.colors.success,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0
          }
        ]
      },
      options: {
        ...this.getCommonOptions(),
        scales: {
          ...this.getCommonOptions().scales,
          y: {
            ...this.getCommonOptions().scales.y,
            beginAtZero: true,
            title: {
              display: true,
              text: '歩',
              color: this.getTextColor()
            }
          }
        }
      }
    });
  },

  /**
   * すべてのグラフを描画
   */
  renderAllCharts(chartData) {
    this.renderWeightChart(chartData.weight);
    this.renderCalorieChart(chartData.calories);
    this.renderPFCChart(chartData.stats.pfc);
    this.renderWaistChart(chartData.waist);
    this.renderStepsChart(chartData.steps);
  },

  /**
   * テーマ変更時にグラフを更新
   */
  updateChartsTheme() {
    Object.values(this.charts).forEach(chart => {
      if (chart && chart.options) {
        if (chart.options.scales) {
          Object.keys(chart.options.scales).forEach(scaleKey => {
            if (chart.options.scales[scaleKey].grid) {
              chart.options.scales[scaleKey].grid.color = this.getGridColor();
            }
            if (chart.options.scales[scaleKey].ticks) {
              chart.options.scales[scaleKey].ticks.color = this.getTextColor();
            }
            if (chart.options.scales[scaleKey].title) {
              chart.options.scales[scaleKey].title.color = this.getTextColor();
            }
          });
        }

        if (chart.options.plugins && chart.options.plugins.legend) {
          chart.options.plugins.legend.labels.color = this.getTextColor();
        }

        chart.update();
      }
    });
  },

  /**
   * すべてのグラフを破棄
   */
  destroyAllCharts() {
    Object.values(this.charts).forEach(chart => {
      if (chart) {
        chart.destroy();
      }
    });
    this.charts = {};
  }
};
