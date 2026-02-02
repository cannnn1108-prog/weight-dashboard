/**
 * データ取得・加工モジュール
 * Google Sheets（公開URL）からデータを取得
 */

const DataManager = {
  // 設定
  config: {
    sheetId: '12nJDx3anatLU4vMt09JvJek5fyS9uFE6AvWYk0uwpBQ',
    localDataPath: 'data/sample.json'
  },

  // キャッシュされたデータ
  cachedData: null,

  /**
   * ローカルJSONファイルからデータを取得
   */
  async loadLocalData() {
    try {
      // キャッシュバスティング用のタイムスタンプを追加
      const cacheBuster = `?v=${Date.now()}`;
      const response = await fetch(this.config.localDataPath + cacheBuster);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this.cachedData = data;
      return data;
    } catch (error) {
      console.error('ローカルデータの読み込みに失敗しました:', error);
      throw error;
    }
  },

  /**
   * Google Sheetsから公開URLでデータを取得（APIキー不要）
   */
  async loadFromGoogleSheets(sheetId) {
    if (sheetId) {
      this.config.sheetId = sheetId;
    }

    try {
      // Inputシートからデータ取得
      const dailyLog = await this.fetchSheetPublic('Input');
      // settingsシートからデータ取得（存在しなければデフォルト使用）
      let settings;
      try {
        const settingsData = await this.fetchSheetPublic('settings');
        settings = this.parseSettingsSheet(settingsData);
      } catch (e) {
        console.log('settingsシートが見つかりません。デフォルト設定を使用します。');
        settings = this.getDefaultSettings();
      }

      // ローカルJSONから食事データと目標履歴を取得
      let meals = {};
      let goalHistory = this.getGoalHistory();
      try {
        // キャッシュバスティング用のタイムスタンプを追加
        const cacheBuster = `?v=${Date.now()}`;
        const localResponse = await fetch(this.config.localDataPath + cacheBuster);
        if (localResponse.ok) {
          const localData = await localResponse.json();
          meals = localData.meals || {};
          goalHistory = localData.goal_history || goalHistory;
        }
      } catch (e) {
        console.log('ローカル食事データの読み込みに失敗しました:', e);
      }

      const data = {
        settings: settings,
        daily_log: this.parseInputSheet(dailyLog),
        weekly_measurements: [],
        meals: meals,
        goal_history: goalHistory
      };

      this.cachedData = data;
      return data;
    } catch (error) {
      console.error('Google Sheetsからのデータ取得に失敗しました:', error);
      throw error;
    }
  },

  /**
   * 公開スプレッドシートからCSV形式でデータを取得
   */
  async fetchSheetPublic(sheetName) {
    // gidを取得するためのマッピング（シート名→gid）
    const sheetGids = {
      'Input': '1807577852',
      'settings': '1234567890'  // settingsシートのgidは後で確認
    };

    const gid = sheetGids[sheetName] || '0';
    const url = `https://docs.google.com/spreadsheets/d/${this.config.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`シート "${sheetName}" の取得に失敗しました`);
    }

    const text = await response.text();
    // Google VizのレスポンスからJSON部分を抽出
    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/);
    if (!jsonMatch) {
      throw new Error('データの解析に失敗しました');
    }

    const jsonData = JSON.parse(jsonMatch[1]);
    return this.parseGoogleVizResponse(jsonData);
  },

  /**
   * Google Visualization APIのレスポンスをパース
   */
  parseGoogleVizResponse(data) {
    if (!data.table || !data.table.rows) {
      return [];
    }

    const cols = data.table.cols.map(col => col.label || '');
    const rows = data.table.rows.map(row => {
      return row.c.map((cell, idx) => {
        if (!cell) return '';
        if (cell.v === null || cell.v === undefined) return '';

        // 日付列（最初の列）の処理
        if (idx === 0) {
          // フォーマット済みの値があればそれを使用
          if (cell.f) {
            return cell.f;
          }
          // Date(year,month,day) 形式を変換
          const val = cell.v;
          if (typeof val === 'string' && val.startsWith('Date(')) {
            const match = val.match(/Date\((\d+),(\d+),(\d+)\)/);
            if (match) {
              const year = match[1];
              const month = String(Number(match[2]) + 1).padStart(2, '0');
              const day = String(match[3]).padStart(2, '0');
              return `${year}/${month}/${day}`;
            }
          }
        }
        return cell.v;
      });
    });

    return [cols, ...rows];
  },

  /**
   * Inputシートをパース（日付, 体重, 腹囲, 歩数, カロリー, メモ）
   */
  parseInputSheet(rows) {
    if (rows.length < 2) return [];

    const data = [];
    // ヘッダー行をスキップ（rows[0]）
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;  // 日付がない行はスキップ

      // 日付を2026年形式に変換
      let dateStr = row[0];

      // Google Vizの Date(year,month,day) 形式をパース
      if (typeof dateStr === 'string' && dateStr.startsWith('Date(')) {
        const match = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (match) {
          const year = match[1];
          const month = String(Number(match[2]) + 1).padStart(2, '0');
          const day = String(match[3]).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        }
      } else if (typeof dateStr === 'string' && dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
        // "2026/1/8" 形式
        const parts = dateStr.split('/');
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof dateStr === 'string' && dateStr.match(/^\d{1,2}\/\d{1,2}$/)) {
        // "1/8" 形式
        const parts = dateStr.split('/');
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        dateStr = `2026-${month}-${day}`;
      } else if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
      }

      // 空文字列やundefinedを正しくnullに変換
      const parseNum = (val) => {
        if (val === null || val === undefined || val === '') return null;
        const num = Number(val);
        return isNaN(num) ? null : num;
      };

      // スプレッドシートの列構造（PFC列削除後）:
      // A=日付, B=体重, C=腹囲, D=歩数, E=カロリー, F=メモ
      const entry = {
        date: dateStr,
        weight: parseNum(row[1]),
        waist: parseNum(row[2]),
        steps: parseNum(row[3]),
        calories_intake: parseNum(row[4]),  // カロリーは列4（E列）
        protein: null,  // PFCはローカルJSONから取得
        fat: null,
        carbs: null,
        notes: row[5] || ''  // メモは列5（F列）
      };

      data.push(entry);
    }

    return data;
  },

  /**
   * 設定シートをパース
   */
  parseSettingsSheet(rows) {
    if (rows.length < 2) {
      return this.getDefaultSettings();
    }

    const settings = {};
    for (let i = 1; i < rows.length; i++) {
      const [key, value] = rows[i];
      if (key && value !== undefined) {
        settings[key] = isNaN(value) ? value : Number(value);
      }
    }

    return { ...this.getDefaultSettings(), ...settings };
  },

  /**
   * デフォルト設定を取得
   */
  getDefaultSettings() {
    return {
      target_weight: 90,
      target_steps: 10000,
      start_weight: 119.2,
      start_date: '2026-01-08',
      basal_metabolism: 2200,
      height: 184,
      age: 30,      // 年齢（BMR計算用）
      gender: 'male', // 性別（BMR計算用）
      goals: {
        calories: 2700,  // 1/20以降の目標
        calories_before_0120: 2600,  // 1/20以前の目標
        protein: 195,
        fat: 58,
        carbs: 325,
        pfc_ratio: '3:2:5'
      }
    };
  },

  /**
   * 目標変更履歴を取得
   */
  getGoalHistory() {
    return [
      {
        date: '2026-01-08',
        title: '減量準備期開始',
        note: 'トレーナー指導のもと減量開始。脂肪対筋力アップを目指しながら、摂取カロリーを本来消費できるカロリーに近づけていく期間',
        calories: 2600,
        protein: 195,
        fat: 58,
        carbs: 325,
        current: false
      },
      {
        date: '2026-01-20',
        title: 'カロリー目標変更',
        note: 'トレーナー指示により摂取カロリーを+100kcal',
        calories: 2700,
        protein: 195,
        fat: 58,
        carbs: 325,
        current: true
      }
    ];
  },

  /**
   * 日付に応じたカロリー目標を取得
   */
  getCalorieTargetForDate(dateStr, settings) {
    const date = new Date(dateStr);
    const changeDate = new Date('2026-01-20');
    const goals = settings.goals || {};

    if (date >= changeDate) {
      return goals.calories || 2700;
    } else {
      return goals.calories_before_0120 || 2600;
    }
  },

  /**
   * 推定消費カロリーを計算
   * Harris-Benedict式で基礎代謝を計算し、歩数から活動代謝を加算
   */
  calculateEstimatedBurn(weight, steps, settings) {
    if (!weight) return null;

    // 基礎代謝（BMR）: Harris-Benedict式（男性）
    // BMR = 88.362 + (13.397 × 体重kg) + (4.799 × 身長cm) - (5.677 × 年齢)
    const height = settings.height || 184;
    const age = settings.age || 30;
    const bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);

    // 歩数による消費カロリー（おおよそ1歩 = 0.04-0.05 kcal）
    const stepsCalories = steps ? steps * 0.045 : 0;

    // 基礎活動（座り仕事）として BMR × 1.2 + 歩数消費
    const totalBurn = Math.round(bmr * 1.2 + stepsCalories);

    return totalBurn;
  },

  /**
   * 毎日のログシートをパース
   */
  parseDailyLogSheet(rows) {
    if (rows.length < 2) return [];

    const headers = rows[0];
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const entry = {};
      headers.forEach((header, index) => {
        const value = row[index];
        if (value === undefined || value === '') {
          entry[header] = header === 'date' || header === 'notes' ? '' : null;
        } else if (header === 'date' || header === 'notes') {
          entry[header] = value;
        } else {
          entry[header] = Number(value) || null;
        }
      });
      data.push(entry);
    }

    return data;
  },

  /**
   * 週次計測シートをパース
   */
  parseWeeklySheet(rows) {
    if (rows.length < 2) return [];

    const headers = rows[0];
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const entry = {};
      headers.forEach((header, index) => {
        const value = row[index];
        if (value === undefined || value === '') {
          entry[header] = header === 'date' ? '' : null;
        } else if (header === 'date') {
          entry[header] = value;
        } else {
          entry[header] = Number(value) || null;
        }
      });
      data.push(entry);
    }

    return data;
  },

  /**
   * 7日間移動平均を計算
   */
  calculateMovingAverage(data, field, days = 7) {
    const result = [];

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - days + 1);
      const slice = data.slice(start, i + 1);
      const validValues = slice.filter(d => d[field] !== null && d[field] > 0).map(d => d[field]);

      if (validValues.length > 0) {
        const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        result.push(Math.round(avg * 100) / 100);
      } else {
        result.push(null);
      }
    }

    return result;
  },

  /**
   * 週間の統計を計算（PFCはローカルJSONの食事データから計算）
   */
  calculateWeeklyStats(data, settings, meals) {
    const last7Days = data.slice(-7);
    const goals = settings.goals || { calories: 2600, protein: 195, fat: 58, carbs: 325 };

    const validCalories = last7Days.filter(d => d.calories_intake !== null && d.calories_intake > 0);
    const avgCalories = validCalories.length > 0
      ? Math.round(validCalories.reduce((sum, d) => sum + d.calories_intake, 0) / validCalories.length)
      : 0;

    const validWeight = last7Days.filter(d => d.weight !== null && d.weight > 0);
    const avgWeight = validWeight.length > 0
      ? validWeight.reduce((sum, d) => sum + d.weight, 0) / validWeight.length
      : 0;

    // PFCバランス計算（ローカルJSONの食事データから）
    let pfc = { protein: 0, carbs: 0, fat: 0 };

    if (meals) {
      let totalProtein = 0;
      let totalFat = 0;
      let totalCarbs = 0;
      let daysWithData = 0;

      // 直近7日間の食事データからPFCを集計
      last7Days.forEach(day => {
        const dayMeals = meals[day.date];
        if (dayMeals) {
          let dayHasData = false;
          const mealTypes = ['breakfast', 'lunch', 'snack', 'dinner'];
          mealTypes.forEach(type => {
            if (dayMeals[type]) {
              dayMeals[type].forEach(item => {
                totalProtein += item.protein || 0;
                totalFat += item.fat || 0;
                totalCarbs += item.carbs || 0;
                dayHasData = true;
              });
            }
          });
          if (dayHasData) daysWithData++;
        }
      });

      if (daysWithData > 0) {
        const proteinCal = totalProtein * 4;
        const carbsCal = totalCarbs * 4;
        const fatCal = totalFat * 9;
        const totalCal = proteinCal + carbsCal + fatCal;

        pfc = {
          protein: totalCal > 0 ? Math.round((proteinCal / totalCal) * 100) : 0,
          carbs: totalCal > 0 ? Math.round((carbsCal / totalCal) * 100) : 0,
          fat: totalCal > 0 ? Math.round((fatCal / totalCal) * 100) : 0
        };
      }
    }

    return {
      avgCalories,
      avgWeight: Math.round(avgWeight * 10) / 10,
      pfc,
      goals
    };
  },

  /**
   * 体重の変化を計算
   */
  calculateWeightChange(data, settings) {
    const validWeights = data.filter(d => d.weight !== null && d.weight > 0);
    if (validWeights.length === 0) {
      return { current: 0, change: 0, changePercent: 0, toGoal: 0 };
    }

    const current = validWeights[validWeights.length - 1].weight;
    const startWeight = settings.start_weight;
    const change = current - startWeight;
    const changePercent = ((change / startWeight) * 100).toFixed(1);
    const toGoal = current - settings.target_weight;

    return {
      current,
      change: Math.round(change * 10) / 10,
      changePercent,
      toGoal: Math.round(toGoal * 10) / 10
    };
  },

  /**
   * 腹囲の変化を計算
   */
  calculateWaistChange(data) {
    const validWaist = data.filter(d => d.waist !== null && d.waist > 0);
    if (validWaist.length === 0) {
      return { current: null, change: null };
    }

    const current = validWaist[validWaist.length - 1].waist;
    const first = validWaist[0].waist;
    const change = current - first;

    return {
      current,
      change: Math.round(change * 10) / 10
    };
  },

  /**
   * 歩数データを取得
   */
  getStepsData(data, settings) {
    const validSteps = data.filter(d => d.steps !== null && d.steps !== undefined);
    const targetSteps = settings.target_steps || 10000;

    // 最新の歩数を取得
    const current = validSteps.length > 0 ? validSteps[validSteps.length - 1].steps : null;

    // 週間平均を計算
    const last7Days = data.slice(-7);
    const validWeekSteps = last7Days.filter(d => d.steps !== null && d.steps !== undefined);
    const avgSteps = validWeekSteps.length > 0
      ? Math.round(validWeekSteps.reduce((sum, d) => sum + d.steps, 0) / validWeekSteps.length)
      : null;

    return {
      current,
      avgSteps,
      target: targetSteps
    };
  },

  /**
   * 前日のカロリーデータを取得
   */
  getYesterdayCalories(data, goals) {
    // 最新のカロリーデータを持つエントリを取得（直近2件）
    const logsWithCalories = data.filter(d => d.calories_intake !== null);
    if (logsWithCalories.length === 0) {
      return { calories: null, diff: null };
    }

    // 最新のエントリ（前日として扱う）
    const latest = logsWithCalories[logsWithCalories.length - 1];
    const diff = latest.calories_intake - goals.calories;

    return {
      calories: latest.calories_intake,
      diff: diff,
      date: latest.date
    };
  },

  /**
   * グラフ用にデータを整形
   */
  prepareChartData(data, settings) {
    const dailyLog = data.daily_log || [];
    const weeklyMeasurements = data.weekly_measurements || [];
    const goals = settings.goals || { calories: 2600, protein: 195, fat: 58, carbs: 325 };

    // 日付でソート
    const sortedDaily = [...dailyLog].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    const sortedWeekly = [...weeklyMeasurements].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    // 腹囲データを日別ログからも取得
    const waistData = sortedDaily
      .filter(d => d.waist !== null && d.waist > 0)
      .map(d => ({ date: d.date, waist: d.waist }));

    // 歩数データを取得
    const stepsData = this.getStepsData(sortedDaily, settings);

    return {
      // 体重グラフ用
      weight: {
        labels: sortedDaily.map(d => this.formatDate(d.date)),
        data: sortedDaily.map(d => d.weight || null),
        movingAvg: this.calculateMovingAverage(sortedDaily, 'weight', 7),
        targetLine: Array(sortedDaily.length).fill(settings.target_weight)
      },

      // カロリーグラフ用（日付に応じた目標線）
      calories: {
        labels: sortedDaily.map(d => this.formatDate(d.date)),
        intake: sortedDaily.map(d => d.calories_intake || null),
        targetLine: sortedDaily.map(d => this.getCalorieTargetForDate(d.date, settings))
      },

      // 腹囲推移用
      waist: {
        labels: waistData.map(d => this.formatDate(d.date)),
        data: waistData.map(d => d.waist)
      },

      // 歩数推移用
      steps: {
        labels: sortedDaily.map(d => this.formatDate(d.date)),
        data: sortedDaily.map(d => d.steps !== undefined ? d.steps : null),
        target: settings.target_steps || 10000,
        targetLine: Array(sortedDaily.length).fill(settings.target_steps || 10000)
      },

      // 統計（mealsを渡してPFCをローカルJSONから計算）
      stats: this.calculateWeeklyStats(sortedDaily, settings, data.meals),
      weightChange: this.calculateWeightChange(sortedDaily, settings),
      waistChange: this.calculateWaistChange(sortedDaily),
      stepsData: stepsData,
      yesterdayCalories: this.getYesterdayCalories(sortedDaily, goals),

      // テーブル用（新しい順、今日以前かつデータがある行のみ）
      recentLogs: (() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return [...sortedDaily]
          .filter(d => {
            const entryDate = new Date(d.date);
            const hasData = d.weight !== null || d.calories_intake !== null || d.waist !== null || d.steps !== null;
            return entryDate <= today && hasData;
          })
          .reverse()
          .slice(0, 14);
      })(),

      // 食事データ
      meals: data.meals || {},

      // 計画データ
      plan: data.plan || null
    };
  },

  /**
   * 特定の日の食事データを取得
   */
  getMealsForDate(date) {
    if (!this.cachedData || !this.cachedData.meals) {
      return null;
    }
    return this.cachedData.meals[date] || null;
  },

  /**
   * PFC評価を取得
   */
  evaluatePFC(log, goals) {
    if (!log.protein || !log.fat || !log.carbs || !goals) {
      return null;
    }

    const proteinDiff = log.protein - goals.protein;
    const fatDiff = log.fat - goals.fat;
    const carbsDiff = log.carbs - goals.carbs;

    const issues = [];
    if (proteinDiff < -20) issues.push('P不足');
    if (fatDiff > 20) issues.push('F過多');
    if (carbsDiff > 50) issues.push('C過多');

    if (issues.length === 0 && Math.abs(proteinDiff) <= 20 && Math.abs(fatDiff) <= 15) {
      return { status: 'good', text: '理想的' };
    } else if (issues.length > 0) {
      return { status: 'warning', text: issues.join('・') };
    }
    return null;
  },

  /**
   * 日付をフォーマット
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },

  /**
   * 設定をローカルストレージに保存
   */
  saveConfig(apiKey, sheetId) {
    localStorage.setItem('weightDashboard_apiKey', apiKey);
    localStorage.setItem('weightDashboard_sheetId', sheetId);
  },

  /**
   * 設定をローカルストレージから読み込み
   */
  loadConfig() {
    return {
      apiKey: localStorage.getItem('weightDashboard_apiKey') || '',
      sheetId: localStorage.getItem('weightDashboard_sheetId') || ''
    };
  }
};
