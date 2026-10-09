// Ported from the approved design prototype (index.html <body>, scripts removed); edit here, the prototype is frozen.
// {{BASE}} is replaced with NEXT_PUBLIC_BASE_PATH at render time.
export const HOME_HTML = `<script>(function(){var d=document.documentElement;d.classList.add('sbh-pre');setTimeout(function(){d.classList.remove('sbh-pre')},3000)})()</script><a class="skip" href="#arch">跳到系統架構</a>

<header class="nav" id="nav">
  <a class="brand" href="#top" aria-label="Sysblade HyperBuffer 回到頂端">
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><rect x="17" y="10" width="2.5" height="4" rx=".8"/><path d="M6.5 12h6"/></svg>
    <span>Sysblade <b>HyperBuffer</b></span>
  </a>
  <nav aria-label="主要導覽">
    <ul id="navlinks">
      <li><a href="#pain">痛點</a></li>
      <li><a href="#stage">即時模擬</a></li>
      <li><a href="#split">分頻</a></li>
      <li><a href="#outage">斷電 60 秒</a></li>
      <li><a href="#ai">AI 預測</a></li>
      <li><a href="#arch">架構</a></li>
      <li><a href="#verify">驗證</a></li>
      <li><a href="#audit">稽核</a></li>
      <li><a href="#demo">Demo</a></li>
    </ul>
    <span class="nav-chip mono" aria-hidden="true"><i></i><span id="nav-chip-v">P_LOAD —</span></span>
  </nav>
</header>

<main id="top">
<!-- ============ 1 · HERO (paper) ============ -->
<section class="hero" aria-labelledby="hero-title">
  <svg class="hero-sketch" id="hero-sketch" aria-hidden="true"></svg>
  <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span>AI 機房備援電源（BBU）· LFP＋LIC 混合儲能 × 數位孿生</p>
  <h1 id="hero-title" class="h1">
    <span class="line"><span class="line-in">峰值與擺盪，</span></span>
    <span class="line"><span class="line-in">交給<em>電容</em>。</span></span>
  </h1>
  <div class="hero-row">
    <p class="lead">AI 機櫃的功率持續擺盪；市電一斷，每台備援電池得瞬間扛約 6C 的峰值。HyperBuffer 讓 LIC 電容先吸收峰值與瞬態、LFP 電池只負責平穩輸出，再用數位孿生預測每一台的剩餘壽命。</p>
    <div class="stats-wrap">
    <div class="stats" role="list">
      <div class="stat" role="listitem">
        <div class="stat-v"><span class="countup" data-to="2.66" data-dec="2" data-json="rack_60s_graceful.json" data-key="stats.dod_pct">2.66</span><small>%</small></div>
        <div class="stat-l">斷電 60 秒，整櫃放電深度</div>
        <div class="stat-s">8 台 BBU 並聯 · 模擬</div>
      </div>
      <div class="stat" role="listitem">
        <div class="stat-v"><span class="countup" data-to="43" data-dec="0">43</span><small>/43</small></div>
        <div class="stat-l">交叉驗證全數通過</div>
        <div class="stat-s mono">$ make verify</div>
      </div>
      <div class="stat" role="listitem">
        <div class="stat-v stat-v-zh">亞軍</div>
        <div class="stat-l">第 23 屆 ATCC 全國決賽</div>
        <div class="stat-s">2026.07</div>
      </div>
    </div>
    <p class="stats-src mono">2.66 載入時讀自 rack_60s_graceful.json（stats.dod_pct）· 43 為 XCHECK 斷言數（scripts/check_whitepaper_numbers.py 輸出，未另存 JSON）</p>
    </div>
  </div>

  <div class="wave" aria-hidden="true">
    <div class="wave-meta mono">
      <span><i class="wave-dot"></i>LIVE · AI 機櫃負載功率 P_LOAD</span>
      <span class="wave-val"><b id="wave-val">—</b> kW</span>
    </div>
    <canvas id="wave"></canvas>
  </div>
  <a class="cue" href="#stage"><span>往下捲，把它拆開來看</span><svg viewBox="0 0 16 24" aria-hidden="true"><path d="M8 2v18M2 14l6 6 6-6"/></svg></a>
</section>


<!-- ============ 2 · PAIN (paper) ============ -->
<section class="sec pain" id="pain" aria-labelledby="pain-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">01</span>痛點</p>
    <h2 id="pain-title" class="h2"><span class="line"><span class="line-in">擺盪與峰值，</span></span><span class="line"><span class="line-in">不該全壓在<em>電池</em>上。</span></span></h2>
    <p class="sec-side">AI 機房的備援電源同時卡在三個問題上，分屬電化學、電力電子與機器學習，整合成本高。</p>
  </div>
  <ol class="pains">
    <li><span class="p-n mono">01</span><h3>秒級功率擺盪＋斷電峰值</h3><p>AI 訓練的機櫃功率在 0.2–3&nbsp;Hz 擺盪（Choukse et al. 2025, arXiv 2508.14318 §III-A）；市電一斷，每台 BBU 瞬間要扛約 6C 的峰值。<small>ORv3 架構下 BBU 平常不放電，混合拓樸在市電正常時參與平滑屬下一步，非本作品已驗證成果。</small></p></li>
    <li><span class="p-n mono">02</span><h3>48 V → ±400 V HVDC 換代</h3><p>機房配電正在換代，2027 年後既有 BBU 需要整批汰換。</p></li>
    <li><span class="p-n mono">03</span><h3>千台級機隊維運</h3><p>動輒上千台 BBU，卻缺少單台等級的剩餘壽命（RUL）預測。</p></li>
  </ol>

  <figure class="compare" id="compare">
    <div class="cmp-top">
      <figcaption class="cmp-cap"><b>同一段負載，兩種 BBU。</b>細線標出每次負載上跳的瞬間：純電池的電壓在同一刻往下掉。滑過圖表可讀任一時刻的數值。</figcaption>
      <div class="seg mono" role="group" aria-label="比較模式">
        <button type="button" data-mode="lfp">純電池 BBU</button><button type="button" data-mode="both" class="on">對照</button><button type="button" data-mode="hyb">HyperBuffer</button>
      </div>
    </div>
    <div class="cmp-legend mono"><span class="lg-l lg-load"><i></i>負載功率 P_LOAD</span><span class="lg-l lg-bad"><i></i>純電池 BBU</span><span class="lg-l lg-good"><i></i>HyperBuffer（LFP＋LIC）</span></div>
    <div class="cmp-plot"><canvas id="cmp" role="img" aria-label="純電池 BBU 與 HyperBuffer 的電池功率與電芯電壓對照"></canvas><div class="cmp-tip mono" id="cmp-tip" hidden></div></div>
    <div class="cmp-stats">
      <div class="cs"><span class="cs-k">電芯電壓穩態峰對峰</span><span class="cs-v mono"><b class="bad">61.6</b> → <b class="good">17.5</b> <small>mV</small></span></div>
      <div class="cs"><span class="cs-k">電池端功率標準差 · 約 5.7×，10 秒全窗示意值</span><span class="cs-v mono"><b class="bad">24.0</b> → <b class="good">4.2</b> <small>kW</small></span></div>
      <div class="cs"><span class="cs-k">負載波形 · 自訂示意波形</span><span class="cs-v mono">56 ↔ 104 <small>kW · 每 100 ms 切換</small></span></div>
    </div>
    <p class="cmp-note"><b>這個倍率怎麼讀。</b>約 5.7× 是 0–10 秒全窗、含濾波器啟動暫態算出的示意值，不是上界，也不是壽命倍率。看頻率響應比較準：τ = 0.5 s 的截止頻率是 <span class="mono">0.318 Hz</span>，1 Hz 的擺盪 LFP 仍承擔約三成；在 <span class="mono">0.2–0.25 Hz</span>（Choukse 2025 主頻帶的低端）幾乎不分流，LFP 仍扛 <span class="mono">96–99%</span> 的峰對峰。<a href="#audit">見自我稽核 A1</a></p>
    <p class="src mono">資料：transient_lfp_only / _hybrid.json（PyBaMM DFN；stats.v_cell_pp_stable 穩態窗 4–6 s、p_lfp_std_kw）· 全部為模擬 · 計入 DC-DC 電流迴路（頻寬假設 26–42 Hz）後，功率標準差約降 3.1–3.9×；原「電壓峰對峰 2.4–3.2×」重現不出，已撤回 · 稽核：docs/audit/A1-frequency.md、A2-power-electronics.md</p>
  </figure>
</section>
<!-- ============ 3 · STAGE (full-bleed dark) ============ -->
<section class="stage dark" id="stage" aria-labelledby="stage-title">
  <div class="stage-pin" id="stage-pin">
    <div class="stage-grid">
      <div class="stage-copy">
        <p class="kicker mono"><span class="k-no">02</span>即時模擬 · transient_hybrid.json</p>
        <h2 id="stage-title" class="sr">混合儲能即時模擬</h2>
        <ol class="steps" id="steps">
          <li class="step" data-step="0"><span class="step-n mono">01 / 04</span><h3 class="step-t">負載每 100&nbsp;ms<br>跳一次。</h3><p class="step-s">AI 機櫃的功率在 56 與 104&nbsp;kW 之間來回切換，每 100&nbsp;ms 一次。</p></li>
          <li class="step" data-step="1"><span class="step-n mono">02 / 04</span><h3 class="step-t">電容先<br><em class="c-lic">接住尖峰</em>。</h3><p class="step-s">LIC 瞬間吐出最高 47.5&nbsp;kW；負載一回落，就由電池慢慢補回。</p></li>
          <li class="step" data-step="2"><span class="step-n mono">03 / 04</span><h3 class="step-t">電池只管<br><em class="c-lfp">平穩輸出</em>。</h3><p class="step-s">LFP 只看到濾波後的平均功率，平穩收斂在 80&nbsp;kW 附近。</p></li>
          <li class="step" data-step="3"><span class="step-n mono">04 / 04</span><h3 class="step-t">τ = 0.5 s，<br>切開高低頻。</h3><p class="step-s">一階互補濾波在 1&nbsp;kHz 控制迴圈中分配功率。畫面是 PyBaMM 模擬的真實資料（慢動作）。</p></li>
        </ol>
      </div>

      <div class="readouts mono" id="readouts">
        <div class="ro" data-k="load"><span class="ro-k"><i></i>P_LOAD 負載</span><span class="ro-v"><span id="ro-load">—</span><small>kW</small></span></div>
        <div class="ro" data-k="lic"><span class="ro-k"><i></i>P_LIC 電容</span><span class="ro-v"><span id="ro-lic">—</span><small>kW</small></span><span class="ro-sub" id="ro-lic-state">—</span></div>
        <div class="ro" data-k="lfp"><span class="ro-k"><i></i>P_LFP 電池</span><span class="ro-v"><span id="ro-lfp">—</span><small>kW</small></span><span class="ro-sub">V_cell <span id="ro-vcell">—</span> V</span></div>
      </div>

      <div class="scene-wrap">
        <svg id="scene" role="img" aria-labelledby="scene-desc">
          <desc id="scene-desc">等角視圖：左側 LFP 電池（剖面可見電極與電量）、中間 LIC 電容組、右側 AI 機櫃，三者以底板上的匯流排相連。負載尖峰時 LIC 亮綠並有能量粒子流向機櫃；LFP 平穩輸出。</desc>
        </svg>
      </div>
    </div>

    <div class="stage-bottom">
      <div class="trace">
        <canvas id="scope" role="img" aria-label="三條功率波形同步捲動：負載、LIC、LFP"></canvas>
        <div class="trace-cursor mono" id="trace-cursor" hidden></div>
      </div>
      <div class="transport mono">
        <button class="tbtn" id="btn-play" type="button" aria-label="暫停" aria-pressed="true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M4 3h3v10H4zM9 3h3v10H9z"/><path class="i-play" d="M4 2.5l9 5.5-9 5.5z"/></svg>
        </button>
        <label class="scrub"><span class="sr">播放位置</span><input type="range" id="scrub" min="0" max="10" step="0.005" value="0"></label>
        <span class="tc"><span id="tc">00.000</span> s</span>
        <div class="speed" role="group" aria-label="播放速度">
          <button type="button" data-speed="0.125" aria-label="八分之一速">1/8×</button><button type="button" data-speed="0.25" class="on" aria-label="四分之一速">1/4×</button><button type="button" data-speed="0.5" aria-label="二分之一速">1/2×</button>
        </div>
        <span class="stage-foot">PyBaMM 26.4.1 DFN · 10 s／800 點 · 慢動作 · 全部為模擬，非實機量測</span>
      </div>
    </div>

    <div class="stepdots mono" id="stepdots" aria-hidden="true"><span>01</span><span>02</span><span>03</span><span>04</span></div>
  </div>
</section>


<!-- ============ 4 · SPLIT (paper) ============ -->
<section class="sec split" id="split" aria-labelledby="split-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">03</span>分頻解法</p>
    <h2 id="split-title" class="h2"><span class="line"><span class="line-in">一個 τ，</span></span><span class="line"><span class="line-in">決定誰扛<em>什麼</em>。</span></span></h2>
    <p class="sec-side">負載功率先經過一階低通濾波：低頻交給 LFP，剩下的高頻由 LIC 吸收。拖動 τ，看兩者分到的功率怎麼變。</p>
  </div>
  <div class="split-grid">
    <div class="split-ctrl">
      <div class="tau-read"><span class="mono tau-k">τ</span><span class="tau-v mono"><b id="tau-v">0.50</b> s</span></div>
      <p class="tau-badge" id="tau-badge"><span class="dot"></span><span id="tau-badge-t">採用值 · 與 PyBaMM 模擬同一控制律</span></p>
      <label class="tau-slider"><span class="sr">時間常數 τ（秒）</span><input type="range" id="tau" min="0.05" max="2" step="0.05" value="0.5"></label>
      <div class="tau-ticks mono" aria-hidden="true"><span style="left:0%">0.05</span><span style="left:23.08%" class="adopt">0.5 採用</span><span style="left:48.72%">1.0</span><span style="left:100%">2.0</span></div>
      <dl class="tau-metrics">
        <div><dt>截止頻率 f<sub>c</sub> = 1/(2πτ)</dt><dd class="mono"><b id="m-fc">0.32</b> Hz</dd></div>
        <div><dt>LFP 穩態漣波（峰對峰）</dt><dd class="mono"><b id="m-std" class="c-lfp-p">4.7</b> kW</dd></div>
        <div><dt>LIC 峰值功率</dt><dd class="mono"><b id="m-peak" class="c-lic-p">47.1</b> kW</dd></div>
        <div><dt>LIC 能量擺幅</dt><dd class="mono"><b id="m-exc" class="c-lic-p">13.5</b> kJ</dd></div>
      </dl>
      <p class="eq mono">P_LFP[n] = P_LFP[n−1] + Δt/(τ+Δt)·(P_LOAD[n] − P_LFP[n−1])<br>P_LIC[n] = P_LOAD[n] − P_LFP[n]</p>
    </div>
    <figure class="split-fig">
      <div class="cmp-legend mono"><span class="lg-l lg-load"><i></i>P_LOAD</span><span class="lg-l lg-lfp"><i></i>P_LFP（前端計算）</span><span class="lg-l lg-lic"><i></i>P_LIC（前端計算）</span><span class="lg-l lg-ref"><i></i>PyBaMM P_LFP（τ = 0.5 s）</span></div>
      <div class="split-plot"><canvas id="splitc" role="img" aria-label="τ 改變時 LFP 與 LIC 分到的功率"></canvas></div>
      <p class="split-note" id="split-note">—</p>
      <p class="src mono">資料：transient_hybrid.json（series.p_total_kw、series.p_lfp_kw）· 漣波＝t ≥ 5 s 每 200 ms 週期的峰對峰平均；LIC 峰值與能量擺幅取全程 10 s · τ ≠ 0.5 s 的曲線為前端以同一控制律即時計算的示意，不是 PyBaMM 模擬結果</p>
    </figure>
  </div>
</section>

<!-- ============ 5 · OUTAGE (full-bleed dark) ============ -->
<section class="outage dark" id="outage" aria-labelledby="outage-title">
  <div class="out-wrap">
    <div class="out-head">
      <div>
        <p class="kicker mono"><span class="k-no">04</span>斷電 60 秒 · 全部為模擬</p>
        <h2 id="outage-title" class="out-title">斷電 <em>60 秒</em>，<br>八台一起撐住。</h2>
      </div>
      <div class="out-head-r">
        <p class="out-sub">8 台 BBU 並聯，每台 2.5 kWh。負載先衝到 120 kW，1.5 秒內斜降到 30 kW 連續輸出。切到 N−1，看 t = 15 s 拔掉一台後剩下 7 台怎麼分擔。</p>
        <div class="seg seg-dark mono" role="group" aria-label="情境">
          <button type="button" data-sc="normal" class="on">正常 · 8 台</button><button type="button" data-sc="n1">N−1 · t = 15 s 拔一台</button>
        </div>
      </div>
    </div>

    <div class="out-grid">
      <dl class="out-ro mono">
        <div class="oro"><dt>P_RACK 負載</dt><dd><b id="o-p">—</b><small>kW</small></dd><span id="o-stage" class="o-stage">峰值保持</span></div>
        <div class="oro"><dt>P_LIC 電容</dt><dd class="c-lic"><b id="o-lic">—</b><small>kW</small></dd><span id="o-lic-s" class="o-stage">待命</span></div>
        <div class="oro"><dt>每台 C-rate</dt><dd class="c-lfp"><b id="o-c">—</b><small>C</small></dd><span id="o-n" class="o-stage">8 台運作</span></div>
        <div class="oro"><dt>電芯溫度</dt><dd><b id="o-temp">—</b><small>°C</small></dd><span class="o-stage">警戒 50°C</span></div>
      </dl>
      <div class="out-scene"><svg id="cab" role="img" aria-labelledby="cab-desc"><desc id="cab-desc">等角視圖：一座 BBU 機櫃，內有 8 台 BBU 抽屜，頂部是 LIC 電容模組。播放時各台負載條隨資料變化；N−1 情境中一台在 15 秒時離線。</desc></svg></div>
      <ol class="bbu-list mono" id="bbu-list" aria-label="各台 BBU 即時狀態"></ol>
    </div>

    <div class="out-bottom">
      <div class="out-tl"><canvas id="otl" role="img" aria-label="60 秒斷電期間的負載、LFP 與 LIC 功率"></canvas></div>
      <div class="transport mono">
        <button class="tbtn" id="o-play" type="button" aria-label="播放" aria-pressed="false">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M4 3h3v10H4zM9 3h3v10H9z"/><path class="i-play" d="M4 2.5l9 5.5-9 5.5z"/></svg>
        </button>
        <label class="scrub"><span class="sr">播放位置</span><input type="range" id="o-scrub" min="0" max="60" step="0.02" value="0"></label>
        <span class="tc"><span id="o-tc">00.0</span> / 60 s</span>
        <div class="speed" role="group" aria-label="播放速度"><button type="button" data-ospeed="3">3×</button><button type="button" data-ospeed="6" class="on">6×</button><button type="button" data-ospeed="12">12×</button></div>
      </div>
      <div class="out-stats">
        <div><b class="mono">2.66<small>%</small></b><span>整櫃放電深度（模擬）<br>1912.5 kJ／72000 kJ</span></div>
        <div><b class="mono">37.6<small>×</small></b><span>能量餘量</span></div>
        <div><b class="mono">25.1<small>°C</small></b><span>電芯最高溫<br>警戒 50°C</span></div>
        <div><b class="mono">1.71<small>C</small></b><span>N−1 後單台連續<br>+14.3%，上限 2.5C</span></div>
      </div>
      <p class="src mono src-dark">時間軸 0–3 s 放大 · 每台放電深度為前端對 P_LFP 積分 · 全部為模擬。資料：rack_60s_graceful.json（stats.dod_pct、energy_headroom_ratio、t_cell_max_c、stages）· rack_n_minus_1.json（stats.c_rate_continuous_post_fault、c_rate_post_increase_pct、pass_criteria；fault_injection.fault_time_s）· 示意中離線的是 BBU-8，資料未指定哪一台</p>
    </div>
  </div>
</section>

<!-- ============ 6 · AI (paper) ============ -->
<section class="sec ai" id="ai" aria-labelledby="ai-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">05</span>AI 壽命預測</p>
    <h2 id="ai-title" class="h2"><span class="line"><span class="line-in">預測壽命，</span></span><span class="line"><span class="line-in">也說出<em>多不確定</em>。</span></span></h2>
    <p class="sec-side">TCN 從每顆電芯的循環特徵預測剩餘壽命，再用 split conformal 校準 90% 預測區間。準的地方和不準的地方，我們都放上來。</p>
  </div>
  <div class="ai-grid">
    <figure class="ai-fig">
      <div class="cmp-legend mono"><span class="lg-l lg-dot lg-train"><i></i>訓練 114＋校準 37 顆</span><span class="lg-l lg-dot lg-test"><i></i>測試 37 顆</span><span class="lg-l lg-dot lg-bbu"><i></i>其中合成 BBU 工況</span><span class="lg-l lg-diag"><i></i>預測 = 實際</span></div>
      <div class="ai-plot"><svg id="scatter" role="img" aria-label="188 顆電芯的預測壽命對實際壽命散點圖（對數座標）"></svg><div class="cmp-tip mono" id="ai-tip" hidden></div></div>
      <p class="src mono">資料：model_validation.json（predicted_vs_actual 188 筆；metrics；uncertainty；model.n_parameters）· 對數座標，單位 cycles</p>
      <div class="ai-audit">
        <span class="mono">自我稽核 · 2026-10-09 · 這張圖的數字要這樣讀</span>
        <b>18.15% 是單一切分、單一種子，而且 early-stop 看了測試集。</b>
        <dl class="ai-audit-row">
          <div><dt>TCN · 無洩漏 10 種子</dt><dd class="mono">28.2<small>% 中位數</small></dd></div>
          <div><dt>bagged-GBT · 同切分</dt><dd class="mono">14.4<small>% · 10/10 勝</small></dd></div>
          <div><dt>conformal 90% · 換批次</dt><dd class="mono">39.8<small>% 覆蓋</small></dd></div>
        </dl>
        <p>改用獨立驗證集做 early-stop、跑 10 個種子：TCN 中位數 28.2%，其中 3 個種子超過 60%；同一切分下 bagged-GBT 為 14.4 ± 1.9%，每個種子都比 TCN 好。conformal 90% 區間只在同分布成立（同分布 91.6%，整批換成未見過的 Severson b3 只剩 39.8%）。精度以 GBT 為準；TCN 留著，只因它能完整靜態 INT8 量化，定位為部署管線示範。</p>
        <small class="mono">scripts/audit/ml_e1_tcn_multiseed.py → data/processed/audit/ml_e1_tcn_multiseed.json · docs/audit/A3-ml-rigor.md</small>
      </div>
    </figure>
    <div class="ai-side">
      <div class="ai-k"><span class="mono">MODEL</span><b>TCN · <span class="mono">31,281</span> 個參數</b><small class="mono">4 層膨脹卷積 · 輸入 99 × 7 特徵</small></div>
      <div class="ai-k"><span class="mono">TEST · n = 37</span><b>MAPE <span class="mono">18.15%</span> · R² <span class="mono">0.892</span></b><small class="mono">random 60/20/20 split · 單一種子 seed 42 · FP32 · 稽核見散點圖下方</small></div>
      <div class="ai-k ai-pi"><span class="mono">90% 預測區間 · 中位寬（cycles）</span>
        <div class="pi-row"><span>MC-Dropout 原始</span><i class="pi-bar" style="--w:100%"></i><b class="mono">2,697</b></div>
        <div class="pi-row"><span>Split conformal</span><i class="pi-bar pi-good" style="--w:50.4%"></i><b class="mono">1,359</b></div>
        <small class="mono">測試集覆蓋率 100%（37 顆，同分布）</small></div>
      <div class="ai-k"><span class="mono">LATENCY</span><b>p99 <span class="mono">0.098 ms</span></b><small class="mono">筆電 CPU · ONNX Runtime · 邊緣 NPU 尚未實測</small></div>
      <div class="ai-warn"><span class="mono">V5 · 公開揭露 · bagged-GBT 基線</span><b>基線模型換到 BBU 工況，誤差從 <span class="mono">9.04%</span> 升到 <span class="mono">80.20%</span>。</b><p>V5 測的是以 Severson 實驗室工況訓練的 bagged-GBT 基線，不是上方的 TCN：直接套到 BBU 工況時誤差大幅上升，量化了工況落差。這是目前最大的已知限制。</p><small class="mono">severson_transfer_mape.json:5、:31-32</small></div>
    </div>
  </div>
</section>

<!-- ============ 7 · ARCHITECTURE (paper) ============ -->
<section class="arch" id="arch" aria-labelledby="arch-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">06</span>系統架構</p>
    <h2 id="arch-title" class="h2"><span class="line"><span class="line-in">五層系統，</span></span><span class="line"><span class="line-in">一條<em>驗證鏈</em>貫穿。</span></span></h2>
    <p class="sec-side">從電化學模型到機隊儀表板，每一層的輸出都是下一層的輸入，也都有對應的驗證關卡，可重跑驗證。還沒有關卡的層，我們直接標成概念設計或模擬資料。</p>
  </div>

  <div class="map">
    <div class="map-top mono">
      <span>SYSTEM MAP · 點擊任一層或驗證節點看細節</span>
      <ul class="legend" aria-label="圖例">
        <li><span class="lg lg-impl" aria-hidden="true"></span>已實作</li>
        <li><span class="lg lg-sim" aria-hidden="true"></span>模擬資料</li>
        <li><span class="lg lg-concept" aria-hidden="true"></span>概念設計</li>
        <li><span class="lg lg-flow" aria-hidden="true"></span>資料流</li>
      </ul>
    </div>
    <div class="arch-diagram" id="arch-diagram">
      <svg class="wires" id="wires" aria-hidden="true"></svg>
      <ol class="layers" id="layers"></ol>
      <div class="rail" id="rail">
        <div class="rail-cols" id="rail-cols"></div>
        <div class="rail-foot">
          <div class="rail-label mono"><span class="rail-key">VERIFY CHAIN</span>每一層對應的驗證關卡　<span class="k-pass">●</span> 通過　<span class="k-disc">●</span> 公開揭露</div>
          <div class="rail-end mono" id="rail-end">
            <span class="prompt">$ make verify</span>
            <span class="xcheck"><b id="xcheck-n">0</b><span class="of">/43</span><em>PASS</em></span>
          </div>
        </div>
      </div>
    </div>
    <div class="detail" id="detail" aria-live="polite"></div>
  </div>
  <p class="arch-note">所有數字取自專案資料檔與作品說明書；邊緣推論為概念設計，機隊資料為模擬資料。</p>
</section>

<!-- ============ 8 · VERIFY + LIMITS (paper) ============ -->
<section class="sec verify" id="verify" aria-labelledby="verify-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">07</span>驗證與限制</p>
    <h2 id="verify-title" class="h2"><span class="line"><span class="line-in">能重跑的，</span></span><span class="line"><span class="line-in">才<em>算數</em>。</span></span></h2>
    <p class="sec-side">make verify 一條指令重跑 V1–V5、V8 與 XCHECK（V1 需另下載約 8.3 GB 資料集），V7 為獨立腳本。拿到 repo 的人都能自己重跑，也看得到我們還沒做到的地方。</p>
  </div>
  <ol class="vgrid" id="vgrid"></ol>
  <div class="vrun">
    <span class="prompt mono">$ make verify</span>
    <div class="vrun-big mono"><b id="v-x">0</b><span>/43</span><em>PASS</em></div>
    <p class="vrun-t">交叉驗證全數通過<small class="mono">全驗 6/6 略過 V1 · 55.2 s（verify_all_report.json）· XCHECK 43/43（README.md:70）</small></p>
  </div>
  <div class="limits">
    <h3 class="lim-h">誠實的限制</h3>
    <ol class="lim-list">
      <li><b>沒有實體硬體原型。</b>8S 實驗機已於 2026-05-27 退貨，現階段為純數位孿生；實機波形量測、電力電子閉環與 UL 9540／9540A 皆尚未完成。<small class="mono">README.md:14 · 說明書:82、:120</small></li>
      <li><b>韌體只是骨架。</b>STM32 韌體為 skeleton，控制律以 Python 模擬器為準。<small class="mono">firmware/stm32_hybrid_control/README.md:14</small></li>
      <li><b>機隊資料是模擬的。</b>1000 台設備與站點皆為合成資料；儀表板設全頁聲明，機隊資料面板帶模擬浮水印。<small class="mono">fleet_devices.json → disclaimer</small></li>
      <li><b>跨工況誤差大。</b>V5（bagged-GBT 基線）：MAPE 從 9.04% 升到 80.20%，模型尚不能直接套用到 BBU 現場資料。<small class="mono">severson_transfer_mape.json:5、:31-32</small></li>
      <li><b>邊緣推論尚未實測。</b>STM32N6 NPU 為概念設計；目前唯一的實測延遲來自筆電 CPU。<small class="mono">model_validation.json → latency · README.md:390</small></li>
    </ol>
  </div>
</section>

<!-- ============ 9 · SELF-AUDIT (paper) — every number traces to docs/audit/A1–A3 ============ -->
<section class="sec audit" id="audit" aria-labelledby="audit-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">08</span>自我稽核 · 2026-10-09</p>
    <h2 id="audit-title" class="h2"><span class="line"><span class="line-in">口試前，</span></span><span class="line"><span class="line-in">我用同一套驗證鏈</span></span><span class="line"><span class="line-in"><em>稽核了自己</em>。</span></span></h2>
    <p class="sec-side">作品說明書已經繳交，內容不再更動。繳交後，我把競賽期的頭條數字放回同一套驗證鏈：重跑、換協定、找反例。下面五項是需要更正的說法，每項列出原本怎麼說、稽核量到什麼、現在怎麼說。全部是模擬或公開資料集上的重算，前提假設寫在每項底下。</p>
  </div>

  <ol class="audit-list">
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A1 · 頻域</span>
        <h3 class="af-t">5.7× 的定義</h3>
        <span class="af-tag">定義更正</span>
        <p class="af-num mono"><s>5.7× 上界</s><i aria-hidden="true">→</i><b>f<sub>c</sub> 0.318 Hz</b></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">原說法</span><p>LFP 功率波動降 5.7×，寫成「理想無損耗上界」；程式註解把 ±30%、每 100&nbsp;ms 切換的示範波形歸給 Choukse 2025。</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ 稽核結果</span><p>5.7× 是 0–10 秒全窗的標準差比，窗內含濾波器啟動暫態；同一波形的穩態是 17.2×，乾淨方波長窗穩態 17.4×（解析解 17.36×），所以它不是上界。Choukse 2025 沒有 ±30% 或 100&nbsp;ms 擺盪，主頻帶是 0.2–3&nbsp;Hz；在 0.2–0.25&nbsp;Hz，τ = 0.5&nbsp;s 時 LFP 仍承擔 96–99% 的峰對峰。</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ 現在怎麼說</span><p>5.7× 只當「10 秒全窗示意值」，改用頻率響應說明：τ = 0.5&nbsp;s 的截止頻率是 0.318&nbsp;Hz。要涵蓋 0.2&nbsp;Hz，τ 得拉到約 5&nbsp;s，LFP 承擔降到約 25%，LIC 能量擺幅約 103&nbsp;kJ。</p></div>
      <p class="af-foot mono"><span><b>前提</b>　Choukse 式波形為假設：120&nbsp;kW 機櫃、通訊階段 30% TDP、50% duty 方波；LIC 能量未扣 ESR 損耗與 UVLO</span><span>scripts/audit/a1_freq_split_audit.py · a1_dfn_cases.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A2 · 電力電子</span>
        <h3 class="af-t">計入 DC-DC 的倍率</h3>
        <span class="af-tag">半撤回</span>
        <p class="af-num mono"><s>2.4–3.9×</s><i aria-hidden="true">→</i><b>3.1–3.9×</b><small>只剩功率</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">原說法</span><p>計入 DC-DC 後典型約 2.4–3.9×，其中電壓峰對峰 2.4–3.2×。這個區間是賽後審查的估計，沒有對應的腳本。</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ 稽核結果</span><p>補寫雙向 DC-DC 平均值模型後，功率標準差降 3.1× 與 3.9× 分別需要約 26&nbsp;Hz 與 42&nbsp;Hz 的電流迴路頻寬。電壓峰對峰在迴路頻寬 ≤ 1&nbsp;kHz 時全部小於 1（0.55–0.57），比沒有 LIC 還差，重現不出來。</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ 現在怎麼說</span><p>只講功率倍率 3.1–3.9×，並附上迴路頻寬 26–42&nbsp;Hz 的假設；電壓那一半撤回。高頻也要看迴路：200&nbsp;Hz 的波形需要約 340&nbsp;Hz 頻寬才有 1.5×。</p></div>
      <p class="af-foot mono"><span><b>前提</b>　平均值模型：一階電流迴路、50&nbsp;µs 控制延遲、η 0.95、無 bus 大電容、理想方波，皆為假設</span><span>scripts/audit/a2_dcdc_average_model.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A2 · 規格邊界</span>
        <h3 class="af-t">電容超出規格</h3>
        <span class="af-tag">超規 · 重新設計</span>
        <p class="af-num mono"><s>51.3 V</s><i aria-hidden="true">→</i><b>13S3P</b><small>39 顆 LIC</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">原說法</span><p>LIC 參數錨定 Eaton XLR-48R6167-R，模擬把滿電電壓設在 51.3&nbsp;V。該型號實為 EDLC，賽後已揭露。</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ 稽核結果</span><p>模組端電壓最高 51.81&nbsp;V，超過規格上限 48.6&nbsp;V，三個情境都超。5&nbsp;Hz 示範波形下每模組 RMS 電流 233&nbsp;A，是連續額定 86&nbsp;A 的 2.7 倍；峰值 463–877&nbsp;A 則在 1 秒峰值 2200&nbsp;A 以內。</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ 現在怎麼說</span><p>改用 3300&nbsp;F 級 LIC 單體重算：至少 13 串 3 並、共 39 顆，中點約 3.5&nbsp;V/cell；DC-DC 限在 60&nbsp;kW 時可降到 14 串 2 並、28 顆。綁住尺寸的是單體峰值電流與 ESR 壓降，不是能量。</p></div>
      <p class="af-foot mono"><span><b>前提</b>　LIC 單體參數取自 2012 年原型的暫定值，不是量產規格書；Eaton 的 86&nbsp;A／2200&nbsp;A 只取得官網摘錄</span><span>scripts/audit/a2_spec_bounds_lic_sizing.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A3 · ML 方法</span>
        <h3 class="af-t">Severson 頭條數字</h3>
        <span class="af-tag">頭條下修</span>
        <p class="af-num mono"><s>8.38%</s><i aria-hidden="true">→</i><b>12.69%</b><small>巢狀選擇</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">原說法</span><p>Severson 資料集 MAPE 8.38%，「優於」論文的 9.1%。</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ 稽核結果</span><p>8.38% 可以逐位重現，但它是 24 組「過濾 × 模型」在測試集上比出來的最小值，並用了 cycle_life ≥ 400 的過濾。改成巢狀選擇（設定只在訓練資料內交叉驗證挑選）後，論文式過濾（≥ 200）的中位數是 12.69%；≥ 400 過濾是 9.47%，但測試母體已排除最短命的電芯。</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ 現在怎麼說</span><p>在論文的過濾條件下，我們沒有超越論文。頭條改引巢狀選擇的 12.69%（10 種子中位數）。</p></div>
      <p class="af-foot mono"><span><b>前提</b>　隨機 70/30 切分、10 種子；論文的固定切分沒有重現，兩邊不能直接比優劣</span><span>scripts/audit/ml_e3_severson_nested.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A3 · ML 方法</span>
        <h3 class="af-t">TCN 壽命模型</h3>
        <span class="af-tag">模型降級</span>
        <p class="af-num mono"><s>18.15%</s><i aria-hidden="true">→</i><b>28.2%</b><small>GBT 14.4%</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">原說法</span><p>TCN 測試 MAPE 18.15%，搭配 conformal 校準的 90% 預測區間。</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ 稽核結果</span><p>18.15% 是單一切分、單一種子，early-stop 也看了測試集。改用獨立驗證集、跑 10 個種子：中位數 28.2%，3 個種子超過 60%；同切分 bagged-GBT 為 14.4 ± 1.9%，10 個種子全勝。conformal 在同分布覆蓋 91.6%，整批換成 Severson b3 只剩 39.8%。</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ 現在怎麼說</span><p>精度以 GBT 為準。TCN 保留的理由只有部署格式：能完整靜態 INT8 量化，定位為部署管線示範。conformal 區間只宣稱在同分布成立，新批次要用現場資料重新校準。</p></div>
      <p class="af-foot mono"><span><b>前提</b>　每個種子測試 37 顆；其中 BBU 電芯是合成資料，標籤與特徵出自同一個生成器，不代表真實 BBU 精度</span><span>scripts/audit/ml_e1_tcn_multiseed.py</span></p>
    </li>
  </ol>

  <div class="audit-end">
    <p class="audit-scope">另有 A4：元件級公開價格與競品公開規格對照，只算元件價格量級、不是量產報價，只放在文件裡。四組稽核的腳本與輸出 JSON、圖都在 repo，每組附重跑指令；稽核沒有改動任何既有模擬數值，上方各段的模擬數字維持原樣，改的是說法。</p>
    <ul class="links links-sm">
      <li><a href="https://github.com/aericheng/atcc-sysblade/tree/main/docs/audit" target="_blank" rel="noopener"><span class="ln mono">docs/audit/</span><span class="lt">完整稽核紀錄</span><span class="ld">A1 頻域、A2 電力電子、A3 ML 方法、A4 成本與競品；每個數字附 JSON 欄位出處</span><span class="la" aria-hidden="true">↗</span></a></li>
      <li><a href="https://github.com/aericheng/atcc-sysblade/tree/main/scripts/audit" target="_blank" rel="noopener"><span class="ln mono">scripts/audit/</span><span class="lt">重跑腳本</span><span class="ld">結果寫入 data/processed/audit/，不覆寫既有 JSON，也不改動 make verify 的輸出</span><span class="la" aria-hidden="true">↗</span></a></li>
    </ul>
  </div>
</section>

<!-- ============ 10 · DEMO ENTRY (paper) ============ -->
<section class="sec demo" id="demo" aria-labelledby="demo-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">09</span>深入展示</p>
    <h2 id="demo-title" class="h2"><span class="line"><span class="line-in">想看更多，</span></span><span class="line"><span class="line-in">打開<em>孿生</em>。</span></span></h2>
    <p class="sec-side">以下連結會開新視窗。儀表板中的所有設備資料皆為模擬。</p>
  </div>
  <ul class="links">
    <li><a href="{{BASE}}/twin/" target="_blank" rel="noopener"><span class="ln mono">/twin</span><span class="lt">數位孿生</span><span class="ld">瞬態、斷電、N−1、老化與模型驗證的完整互動頁</span><span class="la" aria-hidden="true">↗</span></a></li>
    <li><a href="{{BASE}}/dashboard/" target="_blank" rel="noopener"><span class="ln mono">/dashboard</span><span class="lt">機隊儀表板</span><span class="ld">1000 台 BBU 的健康度與汰換佇列 · 模擬資料</span><span class="la" aria-hidden="true">↗</span></a></li>
    <li><a href="https://github.com/aericheng/atcc-sysblade" target="_blank" rel="noopener"><span class="ln mono">GitHub</span><span class="lt">原始碼與驗證鏈</span><span class="ld">clone 後執行 make verify 重跑 V1–V5、V8 與 XCHECK；V7 為獨立腳本</span><span class="la" aria-hidden="true">↗</span></a></li>
  </ul>
</section>

</main>

<footer class="foot">
  <span class="mono">SYSBLADE / HYPERBUFFER · 2026.10</span>
  <span>第 23 屆 ATCC 全國決賽亞軍 · 物理與機隊數據為模擬；ML 指標以公開 Severson 2019＋合成工況計算</span>
  <a href="#top">回到頂端 ↑</a>
</footer>`;
