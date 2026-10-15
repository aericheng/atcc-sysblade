// English translation of HOME_HTML (home-markup.ts). Same DOM: ids, classes, data-* attributes,
// {{BASE}} placeholders and links are identical; only text and aria labels differ.
// Keep every number and every disclosure ("simulated", "not measured", "concept design") in sync with the Chinese source.
export const HOME_HTML_EN = `<script>(function(){var d=document.documentElement;d.classList.add('sbh-pre');setTimeout(function(){d.classList.remove('sbh-pre')},3000)})()</script><a class="skip" href="#arch">Skip to system architecture</a>

<header class="nav" id="nav">
  <a class="brand" href="#top" aria-label="Sysblade HyperBuffer, back to top">
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><rect x="17" y="10" width="2.5" height="4" rx=".8"/><path d="M6.5 12h6"/></svg>
    <span>Sysblade <b>HyperBuffer</b></span>
  </a>
  <nav aria-label="Main navigation">
    <ul id="navlinks">
      <li><a href="#pain">Problem</a></li>
      <li><a href="#stage">Live sim</a></li>
      <li><a href="#split">Split</a></li>
      <li><a href="#outage">60 s outage</a></li>
      <li><a href="#ai">AI RUL</a></li>
      <li><a href="#arch">Architecture</a></li>
      <li><a href="#verify">Verification</a></li>
      <li><a href="#audit">Audit</a></li>
      <li><a href="#demo">Demo</a></li>
    </ul>
    <a class="nav-lang" href="{{BASE}}/" hreflang="zh-Hant" lang="zh-Hant">中文</a>
    <span class="nav-chip mono" aria-hidden="true"><i></i><span id="nav-chip-v">P_LOAD —</span></span>
  </nav>
</header>

<main id="top">
<!-- ============ 1 · HERO (paper) ============ -->
<section class="hero" aria-labelledby="hero-title">
  <svg class="hero-sketch" id="hero-sketch" aria-hidden="true"></svg>
  <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span>Battery backup units (BBU) for AI data centers · LFP + LIC hybrid storage × digital twin</p>
  <h1 id="hero-title" class="h1">
    <span class="line"><span class="line-in">Peaks and swings</span></span>
    <span class="line"><span class="line-in">go to the <em>capacitors</em>.</span></span>
  </h1>
  <div class="hero-row">
    <p class="lead">AI rack power swings constantly, and when utility power fails, each backup battery has to carry a peak of about 6C instantly. HyperBuffer lets a lithium-ion capacitor (LIC) bank absorb the peaks and transients first, leaves the LFP battery to deliver steady output, and uses a digital twin to predict each unit's remaining useful life.</p>
    <div class="stats-wrap">
    <div class="stats" role="list">
      <div class="stat" role="listitem">
        <div class="stat-v"><span class="countup" data-to="2.66" data-dec="2" data-json="rack_60s_graceful.json" data-key="stats.dod_pct">2.66</span><small>%</small></div>
        <div class="stat-l">Rack depth of discharge over a 60 s outage</div>
        <div class="stat-s">8 BBUs in parallel · simulated</div>
      </div>
      <div class="stat" role="listitem">
        <div class="stat-v"><span class="countup" data-to="43" data-dec="0">43</span><small>/43</small></div>
        <div class="stat-l">Cross-checks, all passing</div>
        <div class="stat-s mono">$ make verify</div>
      </div>
      <div class="stat" role="listitem">
        <div class="stat-v stat-v-zh">2nd</div>
        <div class="stat-l">23rd ATCC national final</div>
        <div class="stat-s">2026.07</div>
      </div>
    </div>
    <p class="stats-src mono">2.66 is read at load time from rack_60s_graceful.json (stats.dod_pct) · 43 is the number of XCHECK assertions (output of scripts/check_whitepaper_numbers.py, not saved as JSON)</p>
    </div>
  </div>

  <div class="wave" aria-hidden="true">
    <div class="wave-meta mono">
      <span><i class="wave-dot"></i>LIVE · AI rack load power P_LOAD</span>
      <span class="wave-val"><b id="wave-val">—</b> kW</span>
    </div>
    <canvas id="wave"></canvas>
  </div>
  <a class="cue" href="#stage"><span>Scroll down to take it apart</span><svg viewBox="0 0 16 24" aria-hidden="true"><path d="M8 2v18M2 14l6 6 6-6"/></svg></a>
</section>


<!-- ============ 2 · PAIN (paper) ============ -->
<section class="sec pain" id="pain" aria-labelledby="pain-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">01</span>The problem</p>
    <h2 id="pain-title" class="h2"><span class="line"><span class="line-in">Swings and peaks</span></span><span class="line"><span class="line-in">shouldn't all hit the <em>battery</em>.</span></span></h2>
    <p class="sec-side">Backup power in AI data centers faces three problems at once. They span electrochemistry, power electronics and machine learning, which makes integration expensive.</p>
  </div>
  <ol class="pains">
    <li><span class="p-n mono">01</span><h3>Second-scale power swings + outage peaks</h3><p>The power draw of AI training racks oscillates at 0.2–3&nbsp;Hz (Choukse et al. 2025, arXiv 2508.14318 §III-A); when utility power fails, each BBU has to carry a peak of about 6C instantly.<small>Under ORv3, BBUs do not discharge in normal operation. Using the hybrid topology to smooth power while utility power is available is a next step, not a result this project has verified.</small></p></li>
    <li><span class="p-n mono">02</span><h3>48 V → ±400 V HVDC transition</h3><p>Data center power distribution is moving to a new generation; after 2027, installed BBUs will need to be replaced in bulk.</p></li>
    <li><span class="p-n mono">03</span><h3>Fleets of thousands of units</h3><p>Operators run BBUs by the thousand, yet there is no per-unit remaining useful life (RUL) prediction.</p></li>
  </ol>

  <figure class="compare" id="compare">
    <div class="cmp-top">
      <figcaption class="cmp-cap"><b>Same load, two BBUs.</b> Thin lines mark each upward load step: at that same instant, the battery-only cell voltage drops. Hover over the chart to read the values at any moment.</figcaption>
      <div class="seg mono" role="group" aria-label="Comparison mode">
        <button type="button" data-mode="lfp">Battery-only BBU</button><button type="button" data-mode="both" class="on">Compare</button><button type="button" data-mode="hyb">HyperBuffer</button>
      </div>
    </div>
    <div class="cmp-legend mono"><span class="lg-l lg-load"><i></i>Load power P_LOAD</span><span class="lg-l lg-bad"><i></i>Battery-only BBU</span><span class="lg-l lg-good"><i></i>HyperBuffer (LFP + LIC)</span></div>
    <div class="cmp-plot"><canvas id="cmp" role="img" aria-label="Battery power and cell voltage: battery-only BBU vs. HyperBuffer"></canvas><div class="cmp-tip mono" id="cmp-tip" hidden></div></div>
    <div class="cmp-stats">
      <div class="cs"><span class="cs-k">Cell voltage, steady-state peak-to-peak</span><span class="cs-v mono"><b class="bad">61.6</b> → <b class="good">17.5</b> <small>mV</small></span></div>
      <div class="cs"><span class="cs-k">Battery-side power std. dev. · ~5.7×, illustrative value over the full 10 s window</span><span class="cs-v mono"><b class="bad">24.0</b> → <b class="good">4.2</b> <small>kW</small></span></div>
      <div class="cs"><span class="cs-k">Load waveform · custom illustrative waveform</span><span class="cs-v mono">56 ↔ 104 <small>kW · switches every 100 ms</small></span></div>
    </div>
    <p class="cmp-note"><b>How to read this ratio.</b> The ~5.7× is an illustrative value computed over the full 0–10 s window, including the filter's start-up transient; it is neither an upper bound nor a lifetime multiplier. The frequency response is the more accurate guide: with τ = 0.5 s the cutoff frequency is <span class="mono">0.318 Hz</span>, and at 1 Hz the LFP still carries about 30% of the swing; at <span class="mono">0.2–0.25 Hz</span> (the low end of the Choukse 2025 main band) almost nothing is diverted, and the LFP still carries <span class="mono">96–99%</span> of the peak-to-peak. <a href="#audit">See self-audit A1</a></p>
    <p class="src mono">Data: transient_lfp_only / _hybrid.json (PyBaMM DFN; stats.v_cell_pp_stable over the 4–6 s steady-state window, p_lfp_std_kw) · all simulated · with the DC-DC current loop included (bandwidth assumed at 26–42 Hz), the power std. dev. falls by about 3.1–3.9×; the earlier "voltage peak-to-peak 2.4–3.2×" could not be reproduced and has been withdrawn · Audit: docs/audit/A1-frequency.md, A2-power-electronics.md</p>
  </figure>
</section>
<!-- ============ 3 · STAGE (full-bleed dark) ============ -->
<section class="stage dark" id="stage" aria-labelledby="stage-title">
  <div class="stage-pin" id="stage-pin">
    <div class="stage-grid">
      <div class="stage-copy">
        <p class="kicker mono"><span class="k-no">02</span>Live simulation · transient_hybrid.json</p>
        <h2 id="stage-title" class="sr">Hybrid storage, live simulation</h2>
        <ol class="steps" id="steps">
          <li class="step" data-step="0"><span class="step-n mono">01 / 04</span><h3 class="step-t">The load jumps<br>every 100&nbsp;ms.</h3><p class="step-s">AI rack power switches back and forth between 56 and 104&nbsp;kW, once every 100&nbsp;ms.</p></li>
          <li class="step" data-step="1"><span class="step-n mono">02 / 04</span><h3 class="step-t">Capacitors<br><em class="c-lic">catch the spikes</em> first.</h3><p class="step-s">The LIC delivers up to 47.5&nbsp;kW instantly; when the load drops back, the battery slowly recharges it.</p></li>
          <li class="step" data-step="2"><span class="step-n mono">03 / 04</span><h3 class="step-t">The battery only<br><em class="c-lfp">holds steady</em>.</h3><p class="step-s">The LFP sees only the filtered average power and settles steadily around 80&nbsp;kW.</p></li>
          <li class="step" data-step="3"><span class="step-n mono">04 / 04</span><h3 class="step-t">τ = 0.5 s<br>splits high from low.</h3><p class="step-s">A first-order complementary filter allocates power in a 1&nbsp;kHz control loop. What you see is the actual output of the PyBaMM simulation (slowed down).</p></li>
        </ol>
      </div>

      <div class="readouts mono" id="readouts">
        <div class="ro" data-k="load"><span class="ro-k"><i></i>P_LOAD load</span><span class="ro-v"><span id="ro-load">—</span><small>kW</small></span></div>
        <div class="ro" data-k="lic"><span class="ro-k"><i></i>P_LIC bank</span><span class="ro-v"><span id="ro-lic">—</span><small>kW</small></span><span class="ro-sub" id="ro-lic-state">—</span></div>
        <div class="ro" data-k="lfp"><span class="ro-k"><i></i>P_LFP battery</span><span class="ro-v"><span id="ro-lfp">—</span><small>kW</small></span><span class="ro-sub">V_cell <span id="ro-vcell">—</span> V</span></div>
      </div>

      <div class="scene-wrap">
        <svg id="scene" role="img" aria-labelledby="scene-desc">
          <desc id="scene-desc">Isometric view: the LFP battery on the left (cutaway showing electrodes and charge level), the LIC bank in the middle and the AI rack on the right, connected by busbars on the base plate. During load spikes the LIC glows green and energy particles flow to the rack; the LFP delivers steady output.</desc>
        </svg>
      </div>
    </div>

    <div class="stage-bottom">
      <div class="trace">
        <canvas id="scope" role="img" aria-label="Three power waveforms scrolling in sync: load, LIC, LFP"></canvas>
        <div class="trace-cursor mono" id="trace-cursor" hidden></div>
      </div>
      <div class="transport mono">
        <button class="tbtn" id="btn-play" type="button" aria-label="Pause" aria-pressed="true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M4 3h3v10H4zM9 3h3v10H9z"/><path class="i-play" d="M4 2.5l9 5.5-9 5.5z"/></svg>
        </button>
        <label class="scrub"><span class="sr">Playback position</span><input type="range" id="scrub" min="0" max="10" step="0.005" value="0"></label>
        <span class="tc"><span id="tc">00.000</span> s</span>
        <div class="speed" role="group" aria-label="Playback speed">
          <button type="button" data-speed="0.125" aria-label="One-eighth speed">1/8×</button><button type="button" data-speed="0.25" class="on" aria-label="Quarter speed">1/4×</button><button type="button" data-speed="0.5" aria-label="Half speed">1/2×</button>
        </div>
        <span class="stage-foot">PyBaMM 26.4.1 DFN · 10 s / 800 points · slow motion · all simulated, not measured on hardware</span>
      </div>
    </div>

    <div class="stepdots mono" id="stepdots" aria-hidden="true"><span>01</span><span>02</span><span>03</span><span>04</span></div>
  </div>
</section>


<!-- ============ 4 · SPLIT (paper) ============ -->
<section class="sec split" id="split" aria-labelledby="split-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">03</span>Frequency split</p>
    <h2 id="split-title" class="h2"><span class="line"><span class="line-in">One τ decides</span></span><span class="line"><span class="line-in">who carries <em>what</em>.</span></span></h2>
    <p class="sec-side">Load power first passes through a first-order low-pass filter: the low frequencies go to the LFP, and the LIC absorbs the remaining high frequencies. Drag τ to see how the power each side receives changes.</p>
  </div>
  <div class="split-grid">
    <div class="split-ctrl">
      <div class="tau-read"><span class="mono tau-k">τ</span><span class="tau-v mono"><b id="tau-v">0.50</b> s</span></div>
      <p class="tau-badge" id="tau-badge"><span class="dot"></span><span id="tau-badge-t">Adopted value · same control law as the PyBaMM simulation</span></p>
      <label class="tau-slider"><span class="sr">Time constant τ (seconds)</span><input type="range" id="tau" min="0.05" max="2" step="0.05" value="0.5"></label>
      <div class="tau-ticks mono" aria-hidden="true"><span style="left:0%">0.05</span><span style="left:23.08%" class="adopt">0.5 adopted</span><span style="left:48.72%">1.0</span><span style="left:100%">2.0</span></div>
      <dl class="tau-metrics">
        <div><dt>Cutoff frequency f<sub>c</sub> = 1/(2πτ)</dt><dd class="mono"><b id="m-fc">0.32</b> Hz</dd></div>
        <div><dt>LFP steady-state ripple (peak-to-peak)</dt><dd class="mono"><b id="m-std" class="c-lfp-p">4.7</b> kW</dd></div>
        <div><dt>LIC peak power</dt><dd class="mono"><b id="m-peak" class="c-lic-p">47.1</b> kW</dd></div>
        <div><dt>LIC energy swing</dt><dd class="mono"><b id="m-exc" class="c-lic-p">13.5</b> kJ</dd></div>
      </dl>
      <p class="eq mono">P_LFP[n] = P_LFP[n−1] + Δt/(τ+Δt)·(P_LOAD[n] − P_LFP[n−1])<br>P_LIC[n] = P_LOAD[n] − P_LFP[n]</p>
    </div>
    <figure class="split-fig">
      <div class="cmp-legend mono"><span class="lg-l lg-load"><i></i>P_LOAD</span><span class="lg-l lg-lfp"><i></i>P_LFP (computed in browser)</span><span class="lg-l lg-lic"><i></i>P_LIC (computed in browser)</span><span class="lg-l lg-ref"><i></i>PyBaMM P_LFP (τ = 0.5 s)</span></div>
      <div class="split-plot"><canvas id="splitc" role="img" aria-label="Power allocated to the LFP and the LIC as τ changes"></canvas></div>
      <p class="split-note" id="split-note">—</p>
      <p class="src mono">Data: transient_hybrid.json (series.p_total_kw, series.p_lfp_kw) · ripple = mean peak-to-peak per 200 ms period for t ≥ 5 s; LIC peak and energy swing taken over the full 10 s · curves for τ ≠ 0.5 s are illustrative, computed live in the browser with the same control law; they are not PyBaMM simulation results</p>
    </figure>
  </div>
</section>

<!-- ============ 5 · OUTAGE (full-bleed dark) ============ -->
<section class="outage dark" id="outage" aria-labelledby="outage-title">
  <div class="out-wrap">
    <div class="out-head">
      <div>
        <p class="kicker mono"><span class="k-no">04</span>60 s outage · all simulated</p>
        <h2 id="outage-title" class="out-title"><em>60 s</em> without power,<br>eight units carry the rack.</h2>
      </div>
      <div class="out-head-r">
        <p class="out-sub">8 BBUs in parallel, 2.5 kWh each. The load first surges to 120 kW, then ramps down to 30 kW continuous within 1.5 s. Switch to N−1 to see how the remaining 7 units share the load after one is pulled at t = 15 s.</p>
        <div class="seg seg-dark mono" role="group" aria-label="Scenario">
          <button type="button" data-sc="normal" class="on">Normal · 8 units</button><button type="button" data-sc="n1">N−1 · one pulled at t = 15 s</button>
        </div>
      </div>
    </div>

    <div class="out-grid">
      <dl class="out-ro mono">
        <div class="oro"><dt>P_RACK load</dt><dd><b id="o-p">—</b><small>kW</small></dd><span id="o-stage" class="o-stage">Peak hold</span></div>
        <div class="oro"><dt>P_LIC bank</dt><dd class="c-lic"><b id="o-lic">—</b><small>kW</small></dd><span id="o-lic-s" class="o-stage">Standby</span></div>
        <div class="oro"><dt>C-rate per unit</dt><dd class="c-lfp"><b id="o-c">—</b><small>C</small></dd><span id="o-n" class="o-stage">8 units running</span></div>
        <div class="oro"><dt>Cell temperature</dt><dd><b id="o-temp">—</b><small>°C</small></dd><span class="o-stage">Alarm 50°C</span></div>
      </dl>
      <div class="out-scene"><svg id="cab" role="img" aria-labelledby="cab-desc"><desc id="cab-desc">Isometric view: a BBU cabinet holding 8 BBU drawers, with the LIC bank on top. During playback each unit's load bar follows the data; in the N−1 scenario one unit goes offline at 15 s.</desc></svg></div>
      <ol class="bbu-list mono" id="bbu-list" aria-label="Live status of each BBU"></ol>
    </div>

    <div class="out-bottom">
      <div class="out-tl"><canvas id="otl" role="img" aria-label="Load, LFP and LIC power during the 60 s outage"></canvas></div>
      <div class="transport mono">
        <button class="tbtn" id="o-play" type="button" aria-label="Play" aria-pressed="false">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M4 3h3v10H4zM9 3h3v10H9z"/><path class="i-play" d="M4 2.5l9 5.5-9 5.5z"/></svg>
        </button>
        <label class="scrub"><span class="sr">Playback position</span><input type="range" id="o-scrub" min="0" max="60" step="0.02" value="0"></label>
        <span class="tc"><span id="o-tc">00.0</span> / 60 s</span>
        <div class="speed" role="group" aria-label="Playback speed"><button type="button" data-ospeed="3">3×</button><button type="button" data-ospeed="6" class="on">6×</button><button type="button" data-ospeed="12">12×</button></div>
      </div>
      <div class="out-stats">
        <div><b class="mono">2.66<small>%</small></b><span>Rack depth of discharge (simulated)<br>1912.5 kJ / 72000 kJ</span></div>
        <div><b class="mono">37.6<small>×</small></b><span>Energy headroom</span></div>
        <div><b class="mono">25.1<small>°C</small></b><span>Peak cell temperature<br>alarm threshold 50°C</span></div>
        <div><b class="mono">1.71<small>C</small></b><span>Per-unit continuous after N−1<br>+14.3%, limit 2.5C</span></div>
      </div>
      <p class="src mono src-dark">Timeline 0–3 s zoomed · per-unit depth of discharge is computed in the browser by integrating P_LFP · all simulated. Data: rack_60s_graceful.json (stats.dod_pct, energy_headroom_ratio, t_cell_max_c, stages) · rack_n_minus_1.json (stats.c_rate_continuous_post_fault, c_rate_post_increase_pct, pass_criteria; fault_injection.fault_time_s) · the unit shown going offline is BBU-8; the data does not specify which unit</p>
    </div>
  </div>
</section>

<!-- ============ 6 · AI (paper) ============ -->
<section class="sec ai" id="ai" aria-labelledby="ai-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">05</span>AI lifetime prediction</p>
    <h2 id="ai-title" class="h2"><span class="line"><span class="line-in">Predict the lifetime,</span></span><span class="line"><span class="line-in">and say <em>how unsure</em> it is.</span></span></h2>
    <p class="sec-side">A temporal convolutional network (TCN) predicts remaining useful life from each cell's cycling features, and split conformal calibrates a 90% prediction interval. We show both where it is accurate and where it is not.</p>
  </div>
  <div class="ai-grid">
    <figure class="ai-fig">
      <div class="cmp-legend mono"><span class="lg-l lg-dot lg-train"><i></i>Train 114 + calibration 37 cells</span><span class="lg-l lg-dot lg-test"><i></i>Test 37 cells</span><span class="lg-l lg-dot lg-bbu"><i></i>Synthetic BBU duty (subset)</span><span class="lg-l lg-diag"><i></i>Predicted = actual</span></div>
      <div class="ai-plot"><svg id="scatter" role="img" aria-label="Predicted vs. actual lifetime for 188 cells (log scale)"></svg><div class="cmp-tip mono" id="ai-tip" hidden></div></div>
      <p class="src mono">Data: model_validation.json (predicted_vs_actual, 188 entries; metrics; uncertainty; model.n_parameters) · log scale, unit: cycles</p>
      <div class="ai-audit">
        <span class="mono">Self-audit · 2026-10-09 · how to read the numbers in this chart</span>
        <b>18.15% comes from a single split and a single seed, and early stopping looked at the test set.</b>
        <dl class="ai-audit-row">
          <div><dt>TCN · leak-free, 10 seeds</dt><dd class="mono">28.2<small>% median</small></dd></div>
          <div><dt>bagged-GBT · same splits</dt><dd class="mono">14.4<small>% · wins 10/10</small></dd></div>
          <div><dt>conformal 90% · new batch</dt><dd class="mono">39.8<small>% coverage</small></dd></div>
        </dl>
        <p>With early stopping on a separate validation set and 10 seeds, the TCN's median is 28.2%, and 3 seeds exceed 60%; on the same splits, bagged-GBT reaches 14.4 ± 1.9% and beats the TCN on every seed. The conformal 90% interval holds only in-distribution (91.6% in-distribution; on an entire unseen batch, Severson b3, it falls to 39.8%). Accuracy claims rest on the GBT. The TCN is kept solely because it supports full static INT8 quantization; it serves only as a deployment-pipeline demo.</p>
        <small class="mono">scripts/audit/ml_e1_tcn_multiseed.py → data/processed/audit/ml_e1_tcn_multiseed.json · docs/audit/A3-ml-rigor.md</small>
      </div>
    </figure>
    <div class="ai-side">
      <div class="ai-k"><span class="mono">MODEL</span><b>TCN · <span class="mono">31,281</span> parameters</b><small class="mono">4 dilated conv layers · input 99 × 7 features</small></div>
      <div class="ai-k"><span class="mono">TEST · n = 37</span><b>MAPE <span class="mono">18.15%</span> · R² <span class="mono">0.892</span></b><small class="mono">random 60/20/20 split · single seed (seed 42) · FP32 · audit below the scatter plot</small></div>
      <div class="ai-k ai-pi"><span class="mono">90% prediction interval · median width (cycles)</span>
        <div class="pi-row"><span>MC-Dropout, raw</span><i class="pi-bar" style="--w:100%"></i><b class="mono">2,697</b></div>
        <div class="pi-row"><span>Split conformal</span><i class="pi-bar pi-good" style="--w:50.4%"></i><b class="mono">1,359</b></div>
        <small class="mono">Test-set coverage 100% (37 cells, in-distribution)</small></div>
      <div class="ai-k"><span class="mono">LATENCY</span><b>p99 <span class="mono">0.098 ms</span></b><small class="mono">laptop CPU · ONNX Runtime · not yet measured on an edge NPU</small></div>
      <div class="ai-warn"><span class="mono">V5 · publicly disclosed · bagged-GBT baseline</span><b>When the baseline model is applied to BBU duty, its error rises from <span class="mono">9.04%</span> to <span class="mono">80.20%</span>.</b><p>V5 tests the bagged-GBT baseline trained on Severson lab cycling conditions, not the TCN above. The sharp rise in error when the baseline is applied directly to BBU duty quantifies the gap between operating conditions. This is currently the largest known limitation.</p><small class="mono">severson_transfer_mape.json:5, :31-32</small></div>
    </div>
  </div>
</section>

<!-- ============ 7 · ARCHITECTURE (paper) ============ -->
<section class="arch" id="arch" aria-labelledby="arch-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">06</span>System architecture</p>
    <h2 id="arch-title" class="h2"><span class="line"><span class="line-in">Five layers,</span></span><span class="line"><span class="line-in">one <em>verification chain</em>.</span></span></h2>
    <p class="sec-side">From the electrochemical model to the fleet dashboard, each layer's output is the next layer's input, and each layer has a matching verification gate that can be re-run. Layers that do not have a gate yet are labeled plainly as concept design or simulated data.</p>
  </div>

  <div class="map">
    <div class="map-top mono">
      <span>SYSTEM MAP · click any layer or verification node for details</span>
      <ul class="legend" aria-label="Legend">
        <li><span class="lg lg-impl" aria-hidden="true"></span>Implemented</li>
        <li><span class="lg lg-sim" aria-hidden="true"></span>Simulated data</li>
        <li><span class="lg lg-concept" aria-hidden="true"></span>Concept design</li>
        <li><span class="lg lg-flow" aria-hidden="true"></span>Data flow</li>
      </ul>
    </div>
    <div class="arch-diagram" id="arch-diagram">
      <svg class="wires" id="wires" aria-hidden="true"></svg>
      <ol class="layers" id="layers"></ol>
      <div class="rail" id="rail">
        <div class="rail-cols" id="rail-cols"></div>
        <div class="rail-foot">
          <div class="rail-label mono"><span class="rail-key">VERIFY CHAIN</span>Verification gate for each layer&emsp;<span class="k-pass">●</span> pass&emsp;<span class="k-disc">●</span> publicly disclosed</div>
          <div class="rail-end mono" id="rail-end">
            <span class="prompt">$ make verify</span>
            <span class="xcheck"><b id="xcheck-n">0</b><span class="of">/43</span><em>PASS</em></span>
          </div>
        </div>
      </div>
    </div>
    <div class="detail" id="detail" aria-live="polite"></div>
  </div>
  <p class="arch-note">All numbers are taken from the project's data files and the technical report; edge inference is a concept design, and the fleet data is simulated.</p>
</section>

<!-- ============ 8 · VERIFY + LIMITS (paper) ============ -->
<section class="sec verify" id="verify" aria-labelledby="verify-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">07</span>Verification and limitations</p>
    <h2 id="verify-title" class="h2"><span class="line"><span class="line-in">If it can be re-run,</span></span><span class="line"><span class="line-in">it <em>counts</em>.</span></span></h2>
    <p class="sec-side">A single command, make verify, re-runs V1–V5, V8 and XCHECK (V1 needs a separate download of about 8.3 GB of data); V7 is a standalone script. Anyone with the repo can re-run it, and can also see what we have not done yet.</p>
  </div>
  <ol class="vgrid" id="vgrid"></ol>
  <div class="vrun">
    <span class="prompt mono">$ make verify</span>
    <div class="vrun-big mono"><b id="v-x">0</b><span>/43</span><em>PASS</em></div>
    <p class="vrun-t">All cross-checks pass<small class="mono">full run 6/6, V1 skipped · 55.2 s (verify_all_report.json) · XCHECK 43/43 (README.md:70)</small></p>
  </div>
  <div class="limits">
    <h3 class="lim-h">Honest limitations</h3>
    <ol class="lim-list">
      <li><b>No physical hardware prototype.</b> The 8S test unit was returned on 2026-05-27, so the project is currently a digital twin only; hardware waveform measurements, closed-loop power-electronics validation and UL 9540 / 9540A testing have not been done yet.<small class="mono">README.md:14 · technical report:82, :120</small></li>
      <li><b>The firmware is only a skeleton.</b> The STM32 firmware is a skeleton; the Python simulator is the reference for the control law.<small class="mono">firmware/stm32_hybrid_control/README.md:14</small></li>
      <li><b>The fleet data is simulated.</b> All 1000 devices and sites are synthetic; the dashboard carries a full-page disclaimer, and the fleet-data panels carry a simulation watermark.<small class="mono">fleet_devices.json → disclaimer</small></li>
      <li><b>Large cross-duty transfer error.</b> V5 (bagged-GBT baseline): MAPE rises from 9.04% to 80.20%, so the model cannot yet be applied directly to field BBU data.<small class="mono">severson_transfer_mape.json:5, :31-32</small></li>
      <li><b>Edge inference not yet measured.</b> The STM32N6 NPU is a concept design; the only measured latency so far comes from a laptop CPU.<small class="mono">model_validation.json → latency · README.md:390</small></li>
    </ol>
  </div>
</section>

<!-- ============ 9 · SELF-AUDIT (paper) — every number traces to docs/audit/A1–A3 ============ -->
<section class="sec audit" id="audit" aria-labelledby="audit-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">08</span>Self-audit · 2026-10-09</p>
    <h2 id="audit-title" class="h2"><span class="line"><span class="line-in">Before the ATCC final defense,</span></span><span class="line"><span class="line-in">I turned the same chain</span></span><span class="line"><span class="line-in"><em>on my own claims</em>.</span></span></h2>
    <p class="sec-side">The technical report has been submitted and will not be changed. After submitting it, I put the headline numbers from the competition back through the same verification chain: re-run them, change the protocol, look for counterexamples. The five items below are claims that needed correcting. Each one lists what was originally said, what the audit measured, and what is said now. All of it is recomputation on simulations or public datasets, with the assumptions written under each item.</p>
  </div>

  <ol class="audit-list">
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A1 · Frequency domain</span>
        <h3 class="af-t">What 5.7× means</h3>
        <span class="af-tag">Definition corrected</span>
        <p class="af-num mono"><s>5.7× upper bound</s><i aria-hidden="true">→</i><b>f<sub>c</sub> 0.318 Hz</b></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">Original claim</span><p>LFP power fluctuation reduced 5.7×, written up as an "ideal lossless upper bound"; a code comment attributed the ±30%, 100&nbsp;ms-switching demo waveform to Choukse 2025.</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ Audit finding</span><p>5.7× is the std-dev ratio over the full 0–10 s window, which includes the filter's start-up transient. In steady state the same waveform gives 17.2×, and a clean square wave over a long window gives 17.4× (analytical 17.36×), so it is not an upper bound. Choukse 2025 reports no ±30% or 100&nbsp;ms swing; its main band is 0.2–3&nbsp;Hz. At 0.2–0.25&nbsp;Hz with τ = 0.5&nbsp;s, the LFP still carries 96–99% of the peak-to-peak.</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ Current claim</span><p>5.7× is used only as an "illustrative value over the full 10 s window"; its definition is flawed, so the explanation now uses the frequency response: with τ = 0.5&nbsp;s the cutoff frequency is 0.318&nbsp;Hz. Covering 0.2&nbsp;Hz would require τ of about 5&nbsp;s, which lowers the LFP share to about 25% and raises the LIC energy swing to about 103&nbsp;kJ.</p></div>
      <p class="af-foot mono"><span><b>Assumptions</b>&emsp;Choukse-style waveform is assumed: 120&nbsp;kW rack, 30% TDP during communication phases, 50% duty square wave; the LIC energy estimate does not account for ESR losses or the UVLO floor</span><span>scripts/audit/a1_freq_split_audit.py · a1_dfn_cases.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A2 · Power electronics</span>
        <h3 class="af-t">The ratio with DC-DC included</h3>
        <span class="af-tag">Partly withdrawn</span>
        <p class="af-num mono"><s>2.4–3.9×</s><i aria-hidden="true">→</i><b>3.1–3.9×</b><small>power only</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">Original claim</span><p>With DC-DC included, typically about 2.4–3.9×, of which voltage peak-to-peak 2.4–3.2×. This range was an estimate from the post-competition review, with no corresponding script.</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ Audit finding</span><p>After adding an average-value model of the bidirectional DC-DC, cutting the power std. dev. by 3.1× and 3.9× requires current-loop bandwidths of about 26&nbsp;Hz and 42&nbsp;Hz respectively. With loop bandwidth ≤ 1&nbsp;kHz, the voltage peak-to-peak ratio is below 1 in every case (0.55–0.57), worse than having no LIC at all; the claim could not be reproduced.</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ Current claim</span><p>Only the power ratio, 3.1–3.9×, is stated, together with the assumed loop bandwidth of 26–42&nbsp;Hz; the voltage half is withdrawn. High frequencies also depend on the loop: a 200&nbsp;Hz waveform needs about 340&nbsp;Hz of bandwidth to reach 1.5×.</p></div>
      <p class="af-foot mono"><span><b>Assumptions</b>&emsp;Average-value model: first-order current loop, 50&nbsp;µs control delay, η 0.95, no bulk bus capacitance, ideal square wave; all assumed</span><span>scripts/audit/a2_dcdc_average_model.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A2 · Spec limits</span>
        <h3 class="af-t">Capacitor out of spec</h3>
        <span class="af-tag">Out of spec · redesigned</span>
        <p class="af-num mono"><s>51.3 V</s><i aria-hidden="true">→</i><b>13S3P</b><small>39 LIC cells recommended</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">Original claim</span><p>The LIC parameters were anchored to the Eaton XLR-48R6167-R, and the simulation set the full-charge voltage at 51.3&nbsp;V. That part is actually an EDLC, which was disclosed after the competition.</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ Audit finding</span><p>Module terminal voltage peaks at 51.81&nbsp;V, above the 48.6&nbsp;V spec limit, in all three scenarios. Under the 5&nbsp;Hz demo waveform, RMS current per module is 233&nbsp;A, 2.7 times the 86&nbsp;A continuous rating; the 463–877&nbsp;A peaks stay within the 2200&nbsp;A 1-second peak rating.</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ Current claim</span><p>Recomputed with 3300&nbsp;F-class LIC cells: recommended 13 in series, 3 in parallel, 39 cells in total (minimum feasible 36; the recommended value additionally requires a voltage-reference feasible window ≥ 0.2&nbsp;V/cell), with a midpoint of about 3.5&nbsp;V/cell. With the DC-DC limited to 60&nbsp;kW, the recommendation is 14 in series, 2 in parallel, 28 cells (minimum 26). What sets the size is per-cell peak current and ESR voltage drop, not energy.</p></div>
      <p class="af-foot mono"><span><b>Assumptions</b>&emsp;LIC cell parameters are provisional values from a 2012 prototype, not a production datasheet; Eaton's 86&nbsp;A / 2200&nbsp;A figures come only from an excerpt on its website</span><span>scripts/audit/a2_spec_bounds_lic_sizing.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A3 · ML method</span>
        <h3 class="af-t">The Severson headline</h3>
        <span class="af-tag">Headline revised down</span>
        <p class="af-num mono"><s>8.38%</s><i aria-hidden="true">→</i><b>12.69%</b><small>nested selection</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">Original claim</span><p>MAPE 8.38% on the Severson dataset, "better than" the paper's 9.1%.</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ Audit finding</span><p>8.38% reproduces digit for digit, but it is the minimum of 24 "filter × model" combinations compared on the test set, and it used a cycle_life ≥ 400 filter. With nested selection (settings chosen only by cross-validation within the training data), the median under the paper's filter (≥ 200) is 12.69%; the ≥ 400 filter gives 9.47%, but that test population has already excluded the shortest-lived cells.</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ Current claim</span><p>Under the paper's filter condition, we did not beat the paper. The headline now cites the nested-selection 12.69% (median over 10 seeds).</p></div>
      <p class="af-foot mono"><span><b>Assumptions</b>&emsp;Random 70/30 split, 10 seeds; the paper's fixed split was not reproduced, so the two cannot be ranked directly</span><span>scripts/audit/ml_e3_severson_nested.py</span></p>
    </li>
    <li class="af">
      <div class="af-id">
        <span class="af-n mono">A3 · ML method</span>
        <h3 class="af-t">The TCN lifetime model</h3>
        <span class="af-tag">Model demoted</span>
        <p class="af-num mono"><s>18.15%</s><i aria-hidden="true">→</i><b>28.2%</b><small>GBT 14.4%</small></p>
      </div>
      <div class="af-col af-was"><span class="af-k mono">Original claim</span><p>TCN test MAPE 18.15%, with a conformal-calibrated 90% prediction interval.</p></div>
      <div class="af-col af-found"><span class="af-k mono">→ Audit finding</span><p>18.15% is a single split and a single seed, and early stopping also looked at the test set. With a separate validation set and 10 seeds: median 28.2%, with 3 seeds above 60%; bagged-GBT on the same splits gets 14.4 ± 1.9% and wins on all 10 seeds. Conformal coverage is 91.6% in-distribution, but only 39.8% when the whole test batch is swapped for Severson b3.</p></div>
      <div class="af-col af-now"><span class="af-k mono">→ Current claim</span><p>Accuracy claims rest on the GBT. The only reason to keep the TCN is its deployment format (it supports full static INT8 quantization); it serves only as a deployment-pipeline demo. The conformal interval is claimed to hold only in-distribution; a new batch must be recalibrated with field data.</p></div>
      <p class="af-foot mono"><span><b>Assumptions</b>&emsp;37 test cells per seed; the BBU cells among them are synthetic, with labels and features from the same generator, so they do not represent real BBU accuracy</span><span>scripts/audit/ml_e1_tcn_multiseed.py</span></p>
    </li>
  </ol>

  <div class="audit-end">
    <p class="audit-scope">There is also A4: a comparison against public component-level prices and public competitor specs. It only estimates the order of magnitude of component prices, is not a production quote, and appears only in the documents. The scripts, output JSON and figures for all four audits are in the repo, each with a re-run command. The audit did not change any existing simulated value: the simulated numbers in the sections above stay as they were, and what changed is how they are described.</p>
    <ul class="links links-sm">
      <li><a href="https://github.com/aericheng/atcc-sysblade/tree/main/docs/audit" target="_blank" rel="noopener"><span class="ln mono">docs/audit/</span><span class="lt">Full audit record</span><span class="ld">A1 frequency domain, A2 power electronics, A3 ML method, A4 cost and competitors; every number cites its JSON field</span><span class="la" aria-hidden="true">↗</span></a></li>
      <li><a href="https://github.com/aericheng/atcc-sysblade/tree/main/scripts/audit" target="_blank" rel="noopener"><span class="ln mono">scripts/audit/</span><span class="lt">Re-run scripts</span><span class="ld">Results are written to data/processed/audit/; existing JSON is not overwritten, and make verify output is unchanged</span><span class="la" aria-hidden="true">↗</span></a></li>
    </ul>
  </div>
</section>

<!-- ============ 10 · DEMO ENTRY (paper) ============ -->
<section class="sec demo" id="demo" aria-labelledby="demo-title">
  <div class="sec-head">
    <p class="eyebrow"><span class="sec-no mono">09</span>Go deeper</p>
    <h2 id="demo-title" class="h2"><span class="line"><span class="line-in">Want more?</span></span><span class="line"><span class="line-in">Open the <em>twin</em>.</span></span></h2>
    <p class="sec-side">The links below open in a new window. All device data in the dashboard is simulated.</p>
  </div>
  <ul class="links">
    <li><a href="{{BASE}}/twin/" target="_blank" rel="noopener"><span class="ln mono">/twin</span><span class="lt">Digital twin</span><span class="ld">Full interactive pages for transients, outage, N−1, aging and model validation</span><span class="la" aria-hidden="true">↗</span></a></li>
    <li><a href="{{BASE}}/dashboard/" target="_blank" rel="noopener"><span class="ln mono">/dashboard</span><span class="lt">Fleet dashboard</span><span class="ld">Health and replacement queue for 1000 BBUs · simulated data</span><span class="la" aria-hidden="true">↗</span></a></li>
    <li><a href="https://github.com/aericheng/atcc-sysblade" target="_blank" rel="noopener"><span class="ln mono">GitHub</span><span class="lt">Source code and verification chain</span><span class="ld">Clone it and run make verify to re-run V1–V5, V8 and XCHECK; V7 is a standalone script</span><span class="la" aria-hidden="true">↗</span></a></li>
  </ul>
</section>

</main>

<footer class="foot">
  <span class="mono">SYSBLADE / HYPERBUFFER · 2026.10</span>
  <span>Runner-up, 23rd ATCC national final · physics and fleet data are simulated; ML metrics computed on public Severson 2019 data + synthetic duty cycles</span>
  <a href="#top">Back to top ↑</a>
</footer>`;
