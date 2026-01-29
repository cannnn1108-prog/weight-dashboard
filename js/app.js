/**
 * メインアプリケーションロジック
 */

const App = {
  // 現在のデータソース（デフォルトでGoogleスプレッドシート）
  dataSource: 'sheets',

  // 現在のデータ
  currentData: null,
  chartData: null,

  /**
   * アプリケーションを初期化
   */
  async init() {
    dayjs.locale('ja');
    this.initTheme();
    this.setupEventListeners();
    this.loadSavedConfig();
    await this.loadData();
  },

  /**
   * テーマを初期化
   */
  initTheme() {
    const savedTheme = localStorage.getItem('weightDashboard_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  },

  /**
   * テーマを切り替え
   */
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('weightDashboard_theme', newTheme);
    ChartManager.updateChartsTheme();
  },

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // テーマ切り替えボタン
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // データソース切り替え
    const dataSourceSelect = document.getElementById('dataSource');
    if (dataSourceSelect) {
      dataSourceSelect.addEventListener('change', (e) => this.handleDataSourceChange(e.target.value));
    }

    // Google Sheetsからデータを読み込むボタン
    const loadSheetsBtn = document.getElementById('loadSheets');
    if (loadSheetsBtn) {
      loadSheetsBtn.addEventListener('click', () => this.loadFromSheets());
    }

    // モーダル関連
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalClose = document.querySelector('.modal-close');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', () => this.closeModal());
    }
    if (modalClose) {
      modalClose.addEventListener('click', () => this.closeModal());
    }

    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });

    // システムのテーマ変更を検知
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('weightDashboard_theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        ChartManager.updateChartsTheme();
      }
    });
  },

  /**
   * 保存された設定を読み込み
   */
  loadSavedConfig() {
    const config = DataManager.loadConfig();

    const apiKeyInput = document.getElementById('apiKey');
    const sheetIdInput = document.getElementById('sheetId');

    if (apiKeyInput && config.apiKey) {
      apiKeyInput.value = config.apiKey;
    }
    if (sheetIdInput && config.sheetId) {
      sheetIdInput.value = config.sheetId;
    }
  },

  /**
   * データソースの変更を処理
   */
  handleDataSourceChange(source) {
    this.dataSource = source;
    const configPanel = document.getElementById('sheetsConfig');

    if (source === 'sheets') {
      configPanel.classList.remove('hidden');
    } else {
      configPanel.classList.add('hidden');
      this.loadData();
    }
  },

  /**
   * データを読み込み
   */
  async loadData() {
    try {
      this.showLoading(true);

      let data;
      if (this.dataSource === 'local') {
        data = await DataManager.loadLocalData();
      } else {
        // Google Sheetsから直接読み込み（APIキー不要）
        data = await DataManager.loadFromGoogleSheets();
      }

      this.currentData = data;
      this.renderDashboard(data);
      this.hideError();

    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
      this.showError(`データの読み込みに失敗しました: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  },

  /**
   * Google Sheetsからデータを読み込み
   */
  async loadFromSheets() {
    this.dataSource = 'sheets';
    await this.loadData();
  },

  /**
   * ダッシュボードを描画
   */
  renderDashboard(data) {
    const settings = data.settings || DataManager.getDefaultSettings();
    this.chartData = DataManager.prepareChartData(data, settings);

    // 計画セクションを更新
    this.updatePlanSection(this.chartData.plan, settings);

    // 目標変更履歴を更新
    this.updateGoalHistory(data.goal_history);

    // サマリーカードを更新
    this.updateSummaryCards(this.chartData, settings);

    // グラフを描画
    ChartManager.renderAllCharts(this.chartData);

    // 日別考察を更新
    this.updateDailyInsights(this.chartData.recentLogs, settings);

    // テーブルを更新
    this.updateRecentLogsTable(this.chartData.recentLogs, settings, this.chartData.meals);
  },

  /**
   * 計画セクションを更新
   */
  updatePlanSection(plan, settings) {
    const goals = settings.goals || {};

    // フェーズ名
    const phaseEl = document.getElementById('currentPhase');
    if (phaseEl && plan) {
      phaseEl.textContent = plan.current_phase || '減量準備期';
    }

    // 目標日
    const targetEl = document.getElementById('planTarget');
    if (targetEl && plan) {
      targetEl.textContent = `目標: ${plan.target_date || '未設定'}`;
    }

    // 説明
    const descEl = document.getElementById('planDescription');
    if (descEl && plan) {
      descEl.textContent = plan.description || '';
    }

    // 目標値（現在の日付に応じた目標）
    const todayTarget = DataManager.getCalorieTargetForDate(new Date().toISOString().split('T')[0], settings);
    document.getElementById('targetCalories').textContent = `${todayTarget.toLocaleString()} kcal`;
    document.getElementById('targetProtein').textContent = `${goals.protein || 195}g`;
    document.getElementById('targetFat').textContent = `${goals.fat || 58}g`;
    document.getElementById('targetCarbs').textContent = `${goals.carbs || 325}g`;

    // ガイドライン
    const guidelinesEl = document.getElementById('guidelinesList');
    if (guidelinesEl && plan && plan.guidelines) {
      guidelinesEl.innerHTML = plan.guidelines.map(g => `<li>${g}</li>`).join('');
    }
  },

  /**
   * 目標変更履歴を更新
   */
  updateGoalHistory(history) {
    const timelineEl = document.getElementById('historyTimeline');
    if (!timelineEl || !history || history.length === 0) {
      if (timelineEl) {
        timelineEl.innerHTML = '<p class="empty-state">変更履歴はありません</p>';
      }
      return;
    }

    // 日付順（新しい順）でソート
    const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

    timelineEl.innerHTML = sortedHistory.map((item, index) => {
      const isCurrent = item.current;
      const prevItem = sortedHistory[index + 1]; // 前回の値（古い方）

      // 変更があった項目をハイライト
      const calChanged = prevItem && item.calories !== prevItem.calories;
      const proteinChanged = prevItem && item.protein !== prevItem.protein;
      const fatChanged = prevItem && item.fat !== prevItem.fat;
      const carbsChanged = prevItem && item.carbs !== prevItem.carbs;

      return `
        <div class="history-item ${isCurrent ? 'current' : ''}">
          <div class="history-date">${this.formatDateFull(item.date)}</div>
          <div class="history-content">
            <div class="history-title">${item.title}${isCurrent ? ' (現在)' : ''}</div>
            ${item.note ? `<div class="history-detail">${item.note}</div>` : ''}
            <div class="history-values">
              <span class="history-value ${calChanged ? 'changed' : ''}">
                ${item.calories.toLocaleString()} kcal
                ${calChanged ? `(${item.calories > prevItem.calories ? '+' : ''}${item.calories - prevItem.calories})` : ''}
              </span>
              <span class="history-value ${proteinChanged ? 'changed' : ''}">P: ${item.protein}g</span>
              <span class="history-value ${fatChanged ? 'changed' : ''}">F: ${item.fat}g</span>
              <span class="history-value ${carbsChanged ? 'changed' : ''}">C: ${item.carbs}g</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * サマリーカードを更新
   */
  updateSummaryCards(chartData, settings) {
    const weightChange = chartData.weightChange;
    const waistChange = chartData.waistChange;
    const stepsData = chartData.stepsData;
    const stats = chartData.stats;

    // 現在の体重
    const currentWeightEl = document.getElementById('currentWeight');
    if (currentWeightEl) {
      currentWeightEl.textContent = weightChange.current > 0 ? `${weightChange.current} kg` : '--';
    }

    // 体重変化
    const weightChangeEl = document.getElementById('weightChange');
    if (weightChangeEl) {
      if (weightChange.change !== 0) {
        const sign = weightChange.change > 0 ? '+' : '';
        weightChangeEl.textContent = `開始時から ${sign}${weightChange.change} kg`;
        weightChangeEl.className = `card-change ${weightChange.change < 0 ? 'positive' : 'negative'}`;
      } else {
        weightChangeEl.textContent = '開始時から ±0 kg';
        weightChangeEl.className = 'card-change';
      }
    }

    // 目標まで
    const weightToGoalEl = document.getElementById('weightToGoal');
    if (weightToGoalEl) {
      if (weightChange.toGoal > 0) {
        weightToGoalEl.textContent = `-${weightChange.toGoal} kg`;
      } else if (weightChange.toGoal < 0) {
        weightToGoalEl.textContent = `目標達成!`;
      } else {
        weightToGoalEl.textContent = '--';
      }
    }

    // 目標体重
    const targetWeightEl = document.getElementById('targetWeight');
    if (targetWeightEl) {
      targetWeightEl.textContent = `目標: ${settings.target_weight} kg`;
    }

    // 今週平均カロリー
    const avgCaloriesEl = document.getElementById('avgCalories');
    if (avgCaloriesEl) {
      avgCaloriesEl.textContent = stats.avgCalories > 0 ? stats.avgCalories.toLocaleString() : '--';
    }

    // 腹囲
    const currentWaistEl = document.getElementById('currentWaist');
    if (currentWaistEl) {
      currentWaistEl.textContent = waistChange.current ? `${waistChange.current} cm` : '--';
    }

    // 腹囲変化
    const waistChangeEl = document.getElementById('waistChange');
    if (waistChangeEl && waistChange.change !== null) {
      const sign = waistChange.change > 0 ? '+' : '';
      waistChangeEl.textContent = `開始時から ${sign}${waistChange.change} cm`;
      waistChangeEl.className = `card-change ${waistChange.change < 0 ? 'positive' : 'negative'}`;
    }

    // 歩数
    const currentStepsEl = document.getElementById('currentSteps');
    if (currentStepsEl) {
      if (stepsData && stepsData.current !== null) {
        currentStepsEl.textContent = `${stepsData.current.toLocaleString()} 歩`;
      } else {
        currentStepsEl.textContent = '--';
      }
    }

    // 歩数目標
    const stepsTargetEl = document.getElementById('stepsTarget');
    if (stepsTargetEl) {
      stepsTargetEl.textContent = `目標: ${(settings.target_steps || 10000).toLocaleString()} 歩`;
    }

    // 前日の摂取カロリー
    const yesterdayCaloriesEl = document.getElementById('yesterdayCalories');
    const yesterdayCaloriesDiffEl = document.getElementById('yesterdayCaloriesDiff');
    if (yesterdayCaloriesEl && chartData.yesterdayCalories) {
      const yesterday = chartData.yesterdayCalories;
      yesterdayCaloriesEl.textContent = yesterday.calories !== null
        ? `${yesterday.calories.toLocaleString()} kcal`
        : '--';

      if (yesterdayCaloriesDiffEl && yesterday.diff !== null) {
        const sign = yesterday.diff > 0 ? '+' : '';
        yesterdayCaloriesDiffEl.textContent = `目標比 ${sign}${yesterday.diff.toLocaleString()} kcal`;
        if (yesterday.diff > 200) {
          yesterdayCaloriesDiffEl.className = 'card-change negative';
        } else if (yesterday.diff > 0) {
          yesterdayCaloriesDiffEl.className = 'card-change warning';
        } else {
          yesterdayCaloriesDiffEl.className = 'card-change positive';
        }
      }
    }
  },

  /**
   * 日別考察・改善点を更新
   */
  updateDailyInsights(logs, settings) {
    const container = document.getElementById('dailyInsightsContent');
    if (!container || !logs || logs.length === 0) {
      if (container) {
        container.innerHTML = '<p class="empty-state">データがありません</p>';
      }
      return;
    }

    const goals = settings.goals || {};
    const latestLog = logs[0]; // 最新のログ（新しい順）

    // 考察を生成
    const insights = this.generateInsights(latestLog, logs, goals, settings);

    container.innerHTML = `
      <div class="insights-date">${this.formatDateFull(latestLog.date)} の振り返り</div>
      <div class="insights-grid">
        ${insights.summary ? `
          <div class="insight-card ${insights.summary.status}">
            <div class="insight-icon">${insights.summary.icon}</div>
            <div class="insight-content">
              <div class="insight-title">総合評価</div>
              <div class="insight-value">${insights.summary.text}</div>
            </div>
          </div>
        ` : ''}
        ${insights.calories ? `
          <div class="insight-card ${insights.calories.status}">
            <div class="insight-icon">🔥</div>
            <div class="insight-content">
              <div class="insight-title">カロリー</div>
              <div class="insight-value">${insights.calories.text}</div>
            </div>
          </div>
        ` : ''}
        ${insights.pfc ? `
          <div class="insight-card ${insights.pfc.status}">
            <div class="insight-icon">🥗</div>
            <div class="insight-content">
              <div class="insight-title">PFCバランス</div>
              <div class="insight-value">${insights.pfc.text}</div>
            </div>
          </div>
        ` : ''}
        ${insights.weight ? `
          <div class="insight-card ${insights.weight.status}">
            <div class="insight-icon">⚖️</div>
            <div class="insight-content">
              <div class="insight-title">体重</div>
              <div class="insight-value">${insights.weight.text}</div>
            </div>
          </div>
        ` : ''}
      </div>
      ${insights.improvements.length > 0 ? `
        <div class="improvements-section">
          <h3>明日への改善点</h3>
          <ul class="improvements-list">
            ${insights.improvements.map(imp => `<li>${imp}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${insights.positives.length > 0 ? `
        <div class="positives-section">
          <h3>良かった点</h3>
          <ul class="positives-list">
            ${insights.positives.map(pos => `<li>${pos}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;
  },

  /**
   * 考察を生成
   */
  generateInsights(log, allLogs, goals, settings) {
    const insights = {
      summary: null,
      calories: null,
      pfc: null,
      weight: null,
      improvements: [],
      positives: []
    };

    // カロリー評価
    if (log.calories_intake) {
      const diff = log.calories_intake - goals.calories;
      if (diff > 200) {
        insights.calories = {
          status: 'negative',
          text: `${log.calories_intake.toLocaleString()} kcal（+${diff} kcal 過剰）`
        };
        insights.improvements.push('摂取カロリーを目標に近づける（特に間食や脂質の多い食事を控える）');
      } else if (diff > 0) {
        insights.calories = {
          status: 'warning',
          text: `${log.calories_intake.toLocaleString()} kcal（+${diff} kcal やや過剰）`
        };
        insights.improvements.push('少しだけカロリー超過、明日は意識してみましょう');
      } else if (diff >= -200) {
        insights.calories = {
          status: 'positive',
          text: `${log.calories_intake.toLocaleString()} kcal（目標達成！）`
        };
        insights.positives.push('カロリー管理が適切にできています');
      } else {
        insights.calories = {
          status: 'warning',
          text: `${log.calories_intake.toLocaleString()} kcal（${diff} kcal 不足）`
        };
        insights.improvements.push('カロリーが不足気味です。もう少し食べても大丈夫です');
      }
    }

    // PFC評価
    if (log.protein && log.fat && log.carbs) {
      const pDiff = log.protein - goals.protein;
      const fDiff = log.fat - goals.fat;
      const cDiff = log.carbs - goals.carbs;

      const issues = [];
      if (pDiff < -20) issues.push('P不足');
      if (fDiff > 20) issues.push('F過多');
      if (cDiff > 50) issues.push('C過多');

      if (issues.length === 0 && pDiff >= -10 && fDiff <= 10) {
        insights.pfc = {
          status: 'positive',
          text: '理想的なバランス'
        };
        insights.positives.push('PFCバランスが良好です');
      } else if (issues.length > 0) {
        insights.pfc = {
          status: 'warning',
          text: issues.join('・')
        };
        if (pDiff < -20) {
          insights.improvements.push(`タンパク質が${Math.abs(Math.round(pDiff))}g不足。プロテインや鶏肉を追加しましょう`);
        }
        if (fDiff > 20) {
          insights.improvements.push(`脂質が${Math.round(fDiff)}g過多。揚げ物や油を控えましょう`);
        }
        if (cDiff > 50) {
          insights.improvements.push(`炭水化物が${Math.round(cDiff)}g過多。ご飯の量を調整しましょう`);
        }
      } else {
        insights.pfc = {
          status: 'neutral',
          text: 'おおむね良好'
        };
      }
    }

    // 体重評価（週間平均との比較）
    if (log.weight) {
      const last7 = allLogs.slice(0, 7).filter(l => l.weight);
      if (last7.length > 1) {
        const avg = last7.reduce((sum, l) => sum + l.weight, 0) / last7.length;
        const diff = log.weight - avg;

        if (Math.abs(diff) < 0.5) {
          insights.weight = {
            status: 'positive',
            text: `${log.weight} kg（安定）`
          };
          insights.positives.push('体重が安定しています');
        } else if (diff > 0) {
          insights.weight = {
            status: 'warning',
            text: `${log.weight} kg（週平均より +${diff.toFixed(1)} kg）`
          };
        } else {
          insights.weight = {
            status: 'positive',
            text: `${log.weight} kg（週平均より ${diff.toFixed(1)} kg）`
          };
        }
      }
    }

    // 総合評価
    const hasPositives = insights.positives.length > 0;
    const hasImprovements = insights.improvements.length > 0;

    if (hasPositives && !hasImprovements) {
      insights.summary = {
        status: 'positive',
        icon: '🎉',
        text: '素晴らしい一日でした！この調子で続けましょう'
      };
    } else if (hasPositives && hasImprovements) {
      insights.summary = {
        status: 'neutral',
        icon: '💪',
        text: '良い点もありますが、改善点も意識しましょう'
      };
    } else if (hasImprovements) {
      insights.summary = {
        status: 'warning',
        icon: '📝',
        text: '改善点を明日に活かしましょう'
      };
    } else {
      insights.summary = {
        status: 'neutral',
        icon: '📊',
        text: 'データを入力すると考察が表示されます'
      };
    }

    return insights;
  },

  /**
   * 最近の記録テーブルを更新
   */
  updateRecentLogsTable(logs, settings, meals) {
    const tbody = document.querySelector('#recentLogsTable tbody');
    if (!tbody) return;

    const goals = settings.goals || {};

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>データがありません</p></td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const hasMeals = meals && meals[log.date];
      const eval_ = DataManager.evaluatePFC(log, goals);

      // PFC表示
      let pfcHtml = '-';
      if (log.protein && log.fat && log.carbs) {
        pfcHtml = `<span class="pfc-display">
          <span class="p">P${Math.round(log.protein)}</span> /
          <span class="f">F${Math.round(log.fat)}</span> /
          <span class="c">C${Math.round(log.carbs)}</span>
        </span>`;
        if (eval_) {
          pfcHtml += `<span class="eval-badge ${eval_.status === 'good' ? 'good' : 'warning'}">${eval_.text}</span>`;
        }
      }

      // 摂取カロリー表示（常にクリック可能）
      let caloriesHtml = '-';
      if (log.calories_intake) {
        caloriesHtml = `<span class="calorie-clickable" data-date="${log.date}" data-notes="${encodeURIComponent(log.notes || '')}">${log.calories_intake.toLocaleString()}</span>`;
      }

      // 推定消費カロリー計算
      const estimatedBurn = DataManager.calculateEstimatedBurn(log.weight, log.steps, settings);
      let burnHtml = '-';
      if (estimatedBurn) {
        burnHtml = `${estimatedBurn.toLocaleString()}`;
        // 収支（摂取 - 消費）
        if (log.calories_intake) {
          const balance = log.calories_intake - estimatedBurn;
          const balanceClass = balance < 0 ? 'positive' : (balance > 300 ? 'negative' : 'warning');
          burnHtml += ` <span class="calorie-balance ${balanceClass}">(${balance > 0 ? '+' : ''}${balance})</span>`;
        }
      }

      // 歩数表示
      let stepsHtml = '-';
      if (log.steps !== null && log.steps !== undefined) {
        stepsHtml = `${log.steps.toLocaleString()}`;
      }

      return `
        <tr>
          <td>${this.formatDate(log.date)}</td>
          <td>${log.weight ? `${log.weight} kg` : '-'}</td>
          <td>${log.waist ? `${log.waist} cm` : '-'}</td>
          <td>${stepsHtml}</td>
          <td>${caloriesHtml}</td>
          <td>${burnHtml}</td>
          <td>${pfcHtml}</td>
        </tr>
      `;
    }).join('');

    // カロリーセルにクリックイベントを追加
    tbody.querySelectorAll('.calorie-clickable').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date;
        const notes = decodeURIComponent(el.dataset.notes || '');
        this.showMealModal(date, notes);
      });
    });
  },

  /**
   * 食事詳細モーダルを表示
   */
  showMealModal(date, notes = '') {
    const meals = DataManager.getMealsForDate(date);
    const log = this.chartData.recentLogs.find(l => l.date === date);

    const modal = document.getElementById('mealModal');
    const modalDate = document.getElementById('modalDate');
    const mealDetails = document.getElementById('mealDetails');

    // 日付を表示
    modalDate.textContent = this.formatDateFull(date);

    // 合計を計算
    let totalCal = 0, totalP = 0, totalF = 0, totalC = 0;

    if (meals) {
      const mealTypes = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };

      Object.keys(meals).forEach(type => {
        meals[type].forEach(item => {
          totalCal += item.calories || 0;
          totalP += item.protein || 0;
          totalF += item.fat || 0;
          totalC += item.carbs || 0;
        });
      });

      // 食事詳細を表示
      let detailsHtml = '';
      Object.keys(mealTypes).forEach(type => {
        if (meals[type] && meals[type].length > 0) {
          detailsHtml += `
            <div class="meal-section">
              <h3>${mealTypes[type]}</h3>
              ${meals[type].map(item => `
                <div class="meal-item">
                  <span class="meal-item-name">${item.name}</span>
                  <div class="meal-item-nutrition">
                    <span>${item.calories}kcal</span>
                    <span>P${item.protein}g</span>
                    <span>F${item.fat}g</span>
                    <span>C${item.carbs}g</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }
      });
      mealDetails.innerHTML = detailsHtml;
    } else {
      // mealsがない場合はログからデータを取得
      if (log) {
        totalCal = log.calories_intake || 0;
        totalP = log.protein || 0;
        totalF = log.fat || 0;
        totalC = log.carbs || 0;
      }
      // メモがあれば表示
      const noteText = notes || (log && log.notes) || '';
      if (noteText) {
        mealDetails.innerHTML = `<div class="meal-notes"><p>${noteText}</p></div>`;
      } else {
        mealDetails.innerHTML = '<p class="empty-state">食事詳細データがありません</p>';
      }
    }

    document.getElementById('modalTotalCalories').textContent = totalCal ? `${Math.round(totalCal).toLocaleString()} kcal` : '--';
    document.getElementById('modalTotalProtein').textContent = totalP ? `${Math.round(totalP)}g` : '--';
    document.getElementById('modalTotalFat').textContent = totalF ? `${Math.round(totalF)}g` : '--';
    document.getElementById('modalTotalCarbs').textContent = totalC ? `${Math.round(totalC)}g` : '--';

    // モーダルを表示
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  /**
   * モーダルを閉じる
   */
  closeModal() {
    const modal = document.getElementById('mealModal');
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  },

  /**
   * 日付をフォーマット（短縮形）
   */
  formatDate(dateStr) {
    if (!dateStr) return '-';
    return dayjs(dateStr).format('M/D (ddd)');
  },

  /**
   * 日付をフォーマット（フル）
   */
  formatDateFull(dateStr) {
    if (!dateStr) return '-';
    return dayjs(dateStr).format('YYYY年M月D日 (ddd)');
  },

  /**
   * ローディング状態を表示
   */
  showLoading(show) {
    const container = document.querySelector('.container');
    if (container) {
      if (show) {
        container.classList.add('loading');
      } else {
        container.classList.remove('loading');
      }
    }
  },

  /**
   * エラーメッセージを表示
   */
  showError(message) {
    this.hideError();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.id = 'errorMessage';
    errorDiv.textContent = message;

    const header = document.querySelector('header');
    if (header) {
      header.after(errorDiv);
    }
  },

  /**
   * エラーメッセージを非表示
   */
  hideError() {
    const existingError = document.getElementById('errorMessage');
    if (existingError) {
      existingError.remove();
    }
  }
};

// DOMContentLoadedでアプリを初期化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
