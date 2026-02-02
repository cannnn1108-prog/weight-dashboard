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

    // 日別考察を更新（mealsを渡してPFC計算に使用）
    this.updateDailyInsights(this.chartData.recentLogs, settings, this.chartData.meals);

    // テーブルを更新
    this.updateRecentLogsTable(this.chartData.recentLogs, settings, this.chartData.meals);

    // データ不足警告をチェック
    this.checkDataCompleteness(this.chartData.recentLogs, this.chartData.meals);
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
   * 日別考察・改善点を更新（昨日のデータと今日の体重・腹囲をもとに改善点を表示）
   */
  updateDailyInsights(logs, settings, meals) {
    const container = document.getElementById('dailyInsightsContent');
    if (!container || !logs || logs.length === 0) {
      if (container) {
        container.innerHTML = '<p class="empty-state">データがありません</p>';
      }
      return;
    }

    const goals = settings.goals || {};

    // 今日と昨日の日付を取得
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    // 今日のログを探す（体重・腹囲用）
    const todayLog = logs.find(log => log.date === today);

    // 昨日のログを探す（カロリー・歩数用）
    let yesterdayLog = logs.find(log => log.date === yesterday);

    // 昨日のログがない場合は今日以外の最新ログを使用
    if (!yesterdayLog) {
      yesterdayLog = logs.find(log => log.date !== today) || logs[0];
    }

    if (!yesterdayLog) {
      container.innerHTML = '<p class="empty-state">データがありません</p>';
      return;
    }

    // 昨日の食事データからPFCを計算
    const yesterdayMeals = meals ? meals[yesterdayLog.date] : null;
    let yesterdayPfc = null;
    if (yesterdayMeals) {
      let totalP = 0, totalF = 0, totalC = 0;
      const mealTypes = ['breakfast', 'lunch', 'snack', 'dinner'];
      mealTypes.forEach(type => {
        if (yesterdayMeals[type]) {
          yesterdayMeals[type].forEach(item => {
            totalP += item.protein || 0;
            totalF += item.fat || 0;
            totalC += item.carbs || 0;
          });
        }
      });
      if (totalP > 0 || totalF > 0 || totalC > 0) {
        yesterdayPfc = { protein: totalP, fat: totalF, carbs: totalC };
      }
    }

    // 考察を生成（昨日のカロリー・歩数・PFCと今日の体重・腹囲を使用）
    const insights = this.generateInsights(yesterdayLog, todayLog, logs, goals, settings, yesterdayPfc);

    container.innerHTML = `
      <div class="insights-date">${this.formatDateFull(yesterdayLog.date)} の振り返り → 今日の改善点</div>
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
              <div class="insight-title">昨日のカロリー</div>
              <div class="insight-value">${insights.calories.text}</div>
            </div>
          </div>
        ` : ''}
        ${insights.steps ? `
          <div class="insight-card ${insights.steps.status}">
            <div class="insight-icon">👟</div>
            <div class="insight-content">
              <div class="insight-title">昨日の歩数</div>
              <div class="insight-value">${insights.steps.text}</div>
            </div>
          </div>
        ` : ''}
        ${insights.pfc ? `
          <div class="insight-card ${insights.pfc.status}">
            <div class="insight-icon">🥗</div>
            <div class="insight-content">
              <div class="insight-title">昨日のPFC</div>
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
        ${insights.waist ? `
          <div class="insight-card ${insights.waist.status}">
            <div class="insight-icon">📏</div>
            <div class="insight-content">
              <div class="insight-title">腹囲</div>
              <div class="insight-value">${insights.waist.text}</div>
            </div>
          </div>
        ` : ''}
      </div>
      ${insights.improvements.length > 0 ? `
        <div class="improvements-section">
          <h3>今日の改善点</h3>
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
   * 考察を生成（昨日のデータと今日の体重・腹囲を使用）
   * @param {Object} yesterdayLog - 昨日のログ（カロリー・歩数）
   * @param {Object} todayLog - 今日のログ（体重・腹囲）
   * @param {Array} allLogs - 全てのログ
   * @param {Object} goals - 目標値
   * @param {Object} settings - 設定
   * @param {Object} yesterdayPfc - 昨日のPFC（ローカルJSONから計算）
   */
  generateInsights(yesterdayLog, todayLog, allLogs, goals, settings, yesterdayPfc) {
    const insights = {
      summary: null,
      calories: null,
      steps: null,
      pfc: null,
      weight: null,
      waist: null,
      improvements: [],
      positives: []
    };

    // 昨日のカロリー評価
    if (yesterdayLog.calories_intake) {
      const targetCalories = goals.calories || 2700;
      const diff = yesterdayLog.calories_intake - targetCalories;
      if (diff > 200) {
        insights.calories = {
          status: 'negative',
          text: `${yesterdayLog.calories_intake.toLocaleString()} kcal（目標+${diff} kcal）`
        };
        insights.improvements.push('今日は摂取カロリーを目標に近づける（間食や脂質を控える）');
      } else if (diff > 0) {
        insights.calories = {
          status: 'warning',
          text: `${yesterdayLog.calories_intake.toLocaleString()} kcal（目標+${diff} kcal）`
        };
      } else if (diff >= -200) {
        insights.calories = {
          status: 'positive',
          text: `${yesterdayLog.calories_intake.toLocaleString()} kcal（目標達成）`
        };
        insights.positives.push('昨日のカロリー管理が適切でした');
      } else {
        insights.calories = {
          status: 'warning',
          text: `${yesterdayLog.calories_intake.toLocaleString()} kcal（目標${diff} kcal）`
        };
        insights.improvements.push('カロリーが不足気味。今日はしっかり食べましょう');
      }
    }

    // 昨日の歩数評価
    const targetSteps = settings.target_steps || 10000;
    if (yesterdayLog.steps !== null && yesterdayLog.steps !== undefined) {
      const stepsRatio = Math.round((yesterdayLog.steps / targetSteps) * 100);
      if (yesterdayLog.steps >= targetSteps) {
        insights.steps = {
          status: 'positive',
          text: `${yesterdayLog.steps.toLocaleString()} 歩（目標達成 ${stepsRatio}%）`
        };
        insights.positives.push('昨日の歩数目標を達成しました');
      } else if (stepsRatio >= 70) {
        insights.steps = {
          status: 'warning',
          text: `${yesterdayLog.steps.toLocaleString()} 歩（目標の${stepsRatio}%）`
        };
        insights.improvements.push('今日はもう少し歩いて活動量を増やしましょう');
      } else {
        insights.steps = {
          status: 'negative',
          text: `${yesterdayLog.steps.toLocaleString()} 歩（目標の${stepsRatio}%）`
        };
        insights.improvements.push('活動量が少なめ。今日は意識して歩きましょう');
      }
    }

    // 昨日のPFC評価（ローカルJSONから取得したデータ）
    if (yesterdayPfc) {
      const pDiff = yesterdayPfc.protein - (goals.protein || 200);
      const fDiff = yesterdayPfc.fat - (goals.fat || 60);
      const cDiff = yesterdayPfc.carbs - (goals.carbs || 340);

      const issues = [];
      if (pDiff < -20) issues.push('P不足');
      if (fDiff > 20) issues.push('F過多');
      if (cDiff > 50) issues.push('C過多');

      // PFC割合を計算
      const proteinCal = yesterdayPfc.protein * 4;
      const fatCal = yesterdayPfc.fat * 9;
      const carbsCal = yesterdayPfc.carbs * 4;
      const totalCal = proteinCal + fatCal + carbsCal;
      const pRatio = Math.round((proteinCal / totalCal) * 100);
      const fRatio = Math.round((fatCal / totalCal) * 100);
      const cRatio = Math.round((carbsCal / totalCal) * 100);

      if (issues.length === 0 && pDiff >= -10 && fDiff <= 10) {
        insights.pfc = {
          status: 'positive',
          text: `P${pRatio}% F${fRatio}% C${cRatio}%（良好）`
        };
        insights.positives.push('PFCバランスが良好でした');
      } else if (issues.length > 0) {
        insights.pfc = {
          status: 'warning',
          text: `P${pRatio}% F${fRatio}% C${cRatio}%（${issues.join('・')}）`
        };
        if (pDiff < -20) {
          insights.improvements.push(`タンパク質を${Math.abs(Math.round(pDiff))}g増やす（プロテインや鶏肉）`);
        }
        if (fDiff > 20) {
          insights.improvements.push(`脂質を${Math.round(fDiff)}g減らす（揚げ物を控える）`);
        }
      } else {
        insights.pfc = {
          status: 'neutral',
          text: `P${pRatio}% F${fRatio}% C${cRatio}%`
        };
      }
    }

    // 今日の体重評価（週平均との比較）
    const weightLog = todayLog || yesterdayLog;
    if (weightLog && weightLog.weight) {
      const last7 = allLogs.filter(l => l.weight && l.date !== weightLog.date).slice(0, 7);
      if (last7.length > 0) {
        const avg = last7.reduce((sum, l) => sum + l.weight, 0) / last7.length;
        const diff = weightLog.weight - avg;
        const label = todayLog ? '今朝' : '直近';

        if (Math.abs(diff) < 0.3) {
          insights.weight = {
            status: 'positive',
            text: `${label} ${weightLog.weight} kg（週平均と同等）`
          };
          insights.positives.push('体重が安定しています');
        } else if (diff > 0.5) {
          insights.weight = {
            status: 'warning',
            text: `${label} ${weightLog.weight} kg（週平均+${diff.toFixed(1)} kg）`
          };
          insights.improvements.push('体重が少し増加傾向。今日のカロリーと活動量を意識しましょう');
        } else if (diff > 0) {
          insights.weight = {
            status: 'neutral',
            text: `${label} ${weightLog.weight} kg（週平均+${diff.toFixed(1)} kg）`
          };
        } else {
          insights.weight = {
            status: 'positive',
            text: `${label} ${weightLog.weight} kg（週平均${diff.toFixed(1)} kg）`
          };
        }
      } else {
        const label = todayLog ? '今朝' : '直近';
        insights.weight = {
          status: 'neutral',
          text: `${label} ${weightLog.weight} kg`
        };
      }
    }

    // 今日の腹囲評価
    if (todayLog && todayLog.waist) {
      // 先週の腹囲と比較
      const lastWaist = allLogs.find(l => l.waist && l.date !== todayLog.date);
      if (lastWaist) {
        const diff = todayLog.waist - lastWaist.waist;
        if (Math.abs(diff) < 0.5) {
          insights.waist = {
            status: 'neutral',
            text: `今朝 ${todayLog.waist} cm（維持）`
          };
        } else if (diff < 0) {
          insights.waist = {
            status: 'positive',
            text: `今朝 ${todayLog.waist} cm（${diff.toFixed(1)} cm）`
          };
          insights.positives.push('腹囲が減少しています');
        } else {
          insights.waist = {
            status: 'warning',
            text: `今朝 ${todayLog.waist} cm（+${diff.toFixed(1)} cm）`
          };
        }
      } else {
        insights.waist = {
          status: 'neutral',
          text: `今朝 ${todayLog.waist} cm`
        };
      }
    }

    // 総合評価
    const hasPositives = insights.positives.length > 0;
    const hasImprovements = insights.improvements.length > 0;

    if (hasPositives && !hasImprovements) {
      insights.summary = {
        status: 'positive',
        icon: '🎉',
        text: '昨日は素晴らしい一日でした！今日もこの調子で'
      };
    } else if (hasPositives && hasImprovements) {
      insights.summary = {
        status: 'neutral',
        icon: '💪',
        text: '良い点を維持しつつ、改善点も意識しましょう'
      };
    } else if (hasImprovements) {
      insights.summary = {
        status: 'warning',
        icon: '📝',
        text: '昨日の反省を今日に活かしましょう'
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
      const dayMeals = hasMeals ? meals[log.date] : null;

      // PFC表示（ローカルJSONの食事データから計算）
      let pfcHtml = '-';
      if (dayMeals) {
        let totalP = 0, totalF = 0, totalC = 0;
        const mealTypes = ['breakfast', 'lunch', 'snack', 'dinner'];
        mealTypes.forEach(type => {
          if (dayMeals[type]) {
            dayMeals[type].forEach(item => {
              totalP += item.protein || 0;
              totalF += item.fat || 0;
              totalC += item.carbs || 0;
            });
          }
        });
        if (totalP > 0 || totalF > 0 || totalC > 0) {
          // PFC割合を計算
          const proteinCal = totalP * 4;
          const fatCal = totalF * 9;
          const carbsCal = totalC * 4;
          const totalPfcCal = proteinCal + fatCal + carbsCal;

          const pRatio = Math.round((proteinCal / totalPfcCal) * 100);
          const fRatio = Math.round((fatCal / totalPfcCal) * 100);
          const cRatio = Math.round((carbsCal / totalPfcCal) * 100);

          pfcHtml = `<span class="pfc-display">
            <span class="p">P${pRatio}%</span> /
            <span class="f">F${fRatio}%</span> /
            <span class="c">C${cRatio}%</span>
          </span>`;
          // PFC評価
          const eval_ = DataManager.evaluatePFC({ protein: totalP, fat: totalF, carbs: totalC }, goals);
          if (eval_) {
            pfcHtml += `<span class="eval-badge ${eval_.status === 'good' ? 'good' : 'warning'}">${eval_.text}</span>`;
          }
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
      const mealTypes = {
        breakfast: { name: '朝食', icon: '🌅' },
        lunch: { name: '昼食', icon: '☀️' },
        snack: { name: '間食', icon: '🍪' },
        dinner: { name: '夕食', icon: '🌙' },
        exercise: { name: '筋トレ', icon: '💪', isExercise: true }
      };

      // 各食事タイプのカロリー集計（割合表示用）
      const mealCaloriesData = [];
      let totalMealCalories = 0;

      Object.keys(mealTypes).forEach(type => {
        if (meals[type] && meals[type].length > 0) {
          let typeCal = 0;
          meals[type].forEach(item => {
            const cal = item.calories || 0;
            if (!mealTypes[type].isExercise) {
              totalCal += cal;
              typeCal += cal;
            }
            totalP += item.protein || 0;
            totalF += item.fat || 0;
            totalC += item.carbs || 0;
          });
          if (!mealTypes[type].isExercise && typeCal > 0) {
            totalMealCalories += typeCal;
            mealCaloriesData.push({ type: mealTypes[type].name, calories: typeCal, icon: mealTypes[type].icon });
          }
        }
      });

      // 食事詳細を表示
      let detailsHtml = '';

      // 割合バー
      if (mealCaloriesData.length > 0 && totalMealCalories > 0) {
        const colors = { '朝食': '#4ade80', '昼食': '#60a5fa', '間食': '#fbbf24', '夕食': '#f87171' };
        detailsHtml += '<div class="meal-ratio-section">';
        detailsHtml += '<div class="meal-ratio-bar">';
        mealCaloriesData.forEach(item => {
          const percent = Math.round((item.calories / totalMealCalories) * 100);
          detailsHtml += `<div class="meal-ratio-segment" style="width: ${percent}%; background-color: ${colors[item.type] || '#94a3b8'};" title="${item.type}: ${item.calories}kcal (${percent}%)"></div>`;
        });
        detailsHtml += '</div>';
        detailsHtml += '<div class="meal-ratio-legend">';
        mealCaloriesData.forEach(item => {
          const percent = Math.round((item.calories / totalMealCalories) * 100);
          detailsHtml += `<span class="meal-ratio-item"><span class="meal-ratio-dot" style="background-color: ${colors[item.type] || '#94a3b8'};"></span>${item.type} ${percent}%</span>`;
        });
        detailsHtml += '</div>';
        detailsHtml += '</div>';
      }

      // 各食事セクション
      Object.keys(mealTypes).forEach(type => {
        if (meals[type] && meals[type].length > 0) {
          const typeInfo = mealTypes[type];
          const typeCal = meals[type].reduce((sum, item) => sum + Math.abs(item.calories || 0), 0);
          const calorieDisplay = typeInfo.isExercise
            ? `<span class="meal-calories exercise">-${typeCal}kcal</span>`
            : `<span class="meal-calories">${typeCal}kcal</span>`;

          detailsHtml += `
            <div class="meal-section">
              <h3>${typeInfo.icon} ${typeInfo.name} ${calorieDisplay}</h3>
              <ul class="meal-items-list">
                ${meals[type].map(item => `<li>${item.name}</li>`).join('')}
              </ul>
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
      // メモがあれば表示（整形して表示）
      const noteText = notes || (log && log.notes) || '';
      if (noteText) {
        mealDetails.innerHTML = this.formatMealNotes(noteText);
      } else {
        mealDetails.innerHTML = '<p class="empty-state">食事詳細データがありません</p>';
      }
    }

    document.getElementById('modalTotalCalories').textContent = totalCal ? `${Math.round(totalCal).toLocaleString()} kcal` : '--';
    document.getElementById('modalTotalProtein').textContent = totalP ? `${Math.round(totalP)}g` : '--';
    document.getElementById('modalTotalFat').textContent = totalF ? `${Math.round(totalF)}g` : '--';
    document.getElementById('modalTotalCarbs').textContent = totalC ? `${Math.round(totalC)}g` : '--';

    // PFC割合を計算して表示
    const pfcRatioEl = document.getElementById('modalPfcRatio');
    if (pfcRatioEl && (totalP > 0 || totalF > 0 || totalC > 0)) {
      const proteinCal = totalP * 4;
      const fatCal = totalF * 9;
      const carbsCal = totalC * 4;
      const totalPfcCal = proteinCal + fatCal + carbsCal;

      const pRatio = Math.round((proteinCal / totalPfcCal) * 100);
      const fRatio = Math.round((fatCal / totalPfcCal) * 100);
      const cRatio = Math.round((carbsCal / totalPfcCal) * 100);

      pfcRatioEl.innerHTML = `
        <span class="pfc-ratio-label">PFC割合:</span>
        <span class="pfc-ratio-values">
          <span class="p">P ${pRatio}%</span> /
          <span class="f">F ${fRatio}%</span> /
          <span class="c">C ${cRatio}%</span>
        </span>
      `;
    } else if (pfcRatioEl) {
      pfcRatioEl.innerHTML = '';
    }

    // モーダルを表示
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  /**
   * 食事メモを整形して表示用HTMLを生成
   */
  formatMealNotes(noteText) {
    // 「/」や「朝食:」「昼食:」「夕食:」「間食:」「筋トレ:」で区切られた形式をパース
    const mealTypes = {
      '朝食': { icon: '🌅', items: [], calories: 0 },
      '昼食': { icon: '☀️', items: [], calories: 0 },
      '間食': { icon: '🍪', items: [], calories: 0 },
      '夕食': { icon: '🌙', items: [], calories: 0 },
      '筋トレ': { icon: '💪', items: [], calories: 0, isExercise: true }
    };

    // 「/」で分割して各食事を取得
    const parts = noteText.split('/').map(p => p.trim()).filter(p => p);

    let hasStructuredData = false;

    parts.forEach(part => {
      // 「朝食:」「昼食:」などのパターンをチェック
      for (const mealType of Object.keys(mealTypes)) {
        const pattern = new RegExp(`^${mealType}[:：]?\\s*(.+)`, 'i');
        const match = part.match(pattern);
        if (match) {
          hasStructuredData = true;
          const content = match[1].trim();

          // カロリーを抽出（最後の括弧内の数値kcal）
          const calorieMatch = content.match(/\((\d+)kcal[^)]*\)\s*$/);
          if (calorieMatch) {
            mealTypes[mealType].calories = parseInt(calorieMatch[1], 10);
          }

          // カンマで分割して個別のアイテムに（カロリー表記は除去）
          const items = content.split(',').map(item => {
            // 各アイテムからカロリー表記を除去
            return item.trim().replace(/\(\d+kcal[^)]*\)\s*$/, '').trim();
          }).filter(item => item);
          mealTypes[mealType].items.push(...items);
          break;
        }
      }
    });

    // 構造化されたデータがある場合は整形して表示
    if (hasStructuredData) {
      // 食事のみの合計カロリー（筋トレを除く）
      let totalMealCalories = 0;
      const mealCaloriesData = [];

      for (const [mealType, data] of Object.entries(mealTypes)) {
        if (data.items.length > 0 && !data.isExercise && data.calories > 0) {
          totalMealCalories += data.calories;
          mealCaloriesData.push({ type: mealType, calories: data.calories, icon: data.icon });
        }
      }

      let html = '';

      // 割合の表示（食事のみ）
      if (mealCaloriesData.length > 0 && totalMealCalories > 0) {
        html += '<div class="meal-ratio-section">';
        html += '<div class="meal-ratio-bar">';
        const colors = { '朝食': '#4ade80', '昼食': '#60a5fa', '間食': '#fbbf24', '夕食': '#f87171' };
        mealCaloriesData.forEach(item => {
          const percent = Math.round((item.calories / totalMealCalories) * 100);
          html += `<div class="meal-ratio-segment" style="width: ${percent}%; background-color: ${colors[item.type] || '#94a3b8'};" title="${item.type}: ${item.calories}kcal (${percent}%)"></div>`;
        });
        html += '</div>';
        html += '<div class="meal-ratio-legend">';
        mealCaloriesData.forEach(item => {
          const percent = Math.round((item.calories / totalMealCalories) * 100);
          const colors = { '朝食': '#4ade80', '昼食': '#60a5fa', '間食': '#fbbf24', '夕食': '#f87171' };
          html += `<span class="meal-ratio-item"><span class="meal-ratio-dot" style="background-color: ${colors[item.type] || '#94a3b8'};"></span>${item.type} ${percent}%</span>`;
        });
        html += '</div>';
        html += '</div>';
      }

      // 各食事セクション
      for (const [mealType, data] of Object.entries(mealTypes)) {
        if (data.items.length > 0) {
          const calorieDisplay = data.calories > 0
            ? (data.isExercise ? ` <span class="meal-calories exercise">-${data.calories}kcal</span>` : ` <span class="meal-calories">${data.calories}kcal</span>`)
            : '';
          html += `
            <div class="meal-section">
              <h3>${data.icon} ${mealType}${calorieDisplay}</h3>
              <ul class="meal-items-list">
                ${data.items.map(item => `<li>${item}</li>`).join('')}
              </ul>
            </div>
          `;
        }
      }
      return html;
    }

    // 構造化されていない場合はそのまま表示
    return `<div class="meal-notes"><p>${noteText}</p></div>`;
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
  },

  /**
   * データの入力漏れをチェックして警告を表示
   * @param {Array} logs - スプレッドシートからのログデータ
   * @param {Object} meals - sample.jsonからの食事データ
   */
  checkDataCompleteness(logs, meals) {
    const warnings = [];
    const today = dayjs();

    // 直近3日間をチェック（今日を含む）
    for (let i = 0; i < 3; i++) {
      const checkDate = today.subtract(i, 'day');
      const dateStr = checkDate.format('YYYY-MM-DD');
      const displayDate = checkDate.format('M/D (ddd)');

      // スプレッドシートのログを探す
      const log = logs.find(l => l.date === dateStr);
      const hasMeals = meals && meals[dateStr];

      const missingFields = [];

      if (!log) {
        // 今日のデータはまだ入力していなくても警告しない（朝のため）
        if (i > 0) {
          warnings.push({
            date: displayDate,
            dateStr: dateStr,
            type: 'no_data',
            message: `スプレッドシートにデータがありません`
          });
        }
        continue;
      }

      // 各項目のチェック（今日は体重・腹囲のみ、昨日以前は全項目）
      if (i === 0) {
        // 今日は朝のデータのみチェック
        if (!log.weight) missingFields.push('体重');
        if (!log.waist) missingFields.push('腹囲');
      } else {
        // 昨日以前は全項目チェック
        if (!log.weight) missingFields.push('体重');
        if (!log.waist) missingFields.push('腹囲');
        if (!log.calories_intake) missingFields.push('カロリー');
        if (log.steps === null || log.steps === undefined) missingFields.push('歩数');

        // 食事データのチェック（カロリーがあるのに食事詳細がない場合）
        if (log.calories_intake && !hasMeals) {
          warnings.push({
            date: displayDate,
            dateStr: dateStr,
            type: 'missing_meals',
            message: `食事詳細（sample.json）が未登録`
          });
        }
      }

      if (missingFields.length > 0) {
        warnings.push({
          date: displayDate,
          dateStr: dateStr,
          type: 'missing_fields',
          message: `<span class="warning-missing">${missingFields.join('・')}</span>が未入力`
        });
      }
    }

    // 警告を表示
    this.displayWarnings(warnings);
  },

  /**
   * 警告を画面に表示
   * @param {Array} warnings - 警告の配列
   */
  displayWarnings(warnings) {
    const warningsSection = document.getElementById('dataWarnings');
    const warningsList = document.getElementById('warningsList');

    if (!warningsSection || !warningsList) return;

    // 警告がない場合は非表示
    if (warnings.length === 0) {
      warningsSection.classList.add('hidden');
      return;
    }

    // 警告リストを生成
    warningsList.innerHTML = warnings.map(w =>
      `<li><span class="warning-date">${w.date}</span>: ${w.message}</li>`
    ).join('');

    // 閉じるボタンのイベント
    const closeBtn = warningsSection.querySelector('.warnings-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        warningsSection.classList.add('hidden');
      };
    }

    // 警告セクションを表示
    warningsSection.classList.remove('hidden');
  }
};

// DOMContentLoadedでアプリを初期化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
