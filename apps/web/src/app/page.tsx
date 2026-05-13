import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Activity, BarChart3, Cpu, ArrowRight, Zap } from "lucide-react";
import fs from "node:fs/promises";
import path from "node:path";

interface ModelValidationLite {
  metrics: { test_mape_pct: number };
  latency: { p99_ms: number; p50_ms: number };
}

async function loadModelValidation(): Promise<ModelValidationLite | null> {
  try {
    const file = path.join(process.cwd(), "public", "scenarios", "model_validation.json");
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const mv = await loadModelValidation();
  return (
    <div className="space-y-16 sm:space-y-24">
      {/* Hero */}
      <section className="pt-12 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted mb-6">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          OCP Mt. Diablo 400 spec aligned · LFP + LIC hybrid · 2026 Q4 design freeze target
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1] md:leading-[1.05] max-w-4xl text-balance">
          Hybrid energy buffer for{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            AI-rack millisecond transients
          </span>
        </h1>
        <p className="mt-5 sm:mt-6 max-w-2xl text-base sm:text-lg text-muted leading-relaxed">
          Sysblade HyperBuffer combines <span className="text-foreground font-medium">LFP cells</span> with{" "}
          <span className="text-foreground font-medium">lithium-ion capacitors</span> and an embedded{" "}
          <span className="text-foreground font-medium">battery digital twin</span> to absorb the{" "}
          <span className="text-foreground">±30 % power swings</span> GB200/GB300 racks impose on the grid — and turn that data into a SaaS service for the operators who need it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/twin"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            See the physics demo <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/tco"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-2.5 text-sm font-medium hover:bg-surface transition"
          >
            Run TCO calculator
          </Link>
        </div>
      </section>

      {/* Headline numbers from PyBaMM scenarios */}
      <section>
        <div className="text-xs uppercase tracking-[0.2em] text-muted mb-4">
          Headline results · PyBaMM DFN simulation
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {([
            {
              v: "3.5×",
              label: (<>Lower <span className="text-foreground font-medium">cell-voltage swing</span> under GB200 transient</>),
              tone: "from-primary to-accent",
            },
            {
              v: "5.7×",
              label: (<>Lower <span className="text-foreground font-medium">power-stress to LFP</span> after LIC split</>),
              tone: "from-accent to-primary",
            },
            {
              v: "~25 %",
              label: (
                <>
                  <span className="text-foreground font-medium">
                    LFP service-life advantage · BBU low-duty schedule
                  </span>
                  {" "}· §G.3 duty_factor 0.33 (~50 cyc/yr vs Severson 1C/1C) ·{" "}
                  10-yr replacements 1.5 → 1 ·{" "}
                  <span className="text-muted">
                    hybrid-topology rainflow Δ separate ~5 % on worst-case
                  </span>
                </>
              ),
              tone: "from-success to-accent",
            },
            {
              v: "10 yr",
              label: (<><span className="text-foreground font-medium">BBU service life</span> at &gt;80 % SOH (Severson-fit)</>),
              tone: "from-primary to-accent",
            },
            {
              v: "≈33 %",
              label: (<><span className="text-foreground font-medium">10-year TCO reduction</span> · proposal §G.3 baseline</>),
              tone: "from-accent to-primary",
            },
            mv
              ? {
                  v: `${mv.latency.p99_ms.toFixed(2)} ms`,
                  label: (
                    <>
                      <span className="text-foreground font-medium">ONNX p99</span> on laptop CPU · <span className="text-success font-medium">{(50 / mv.latency.p99_ms).toFixed(0)}× under spec</span>{" "}
                      · STM32N6 NPU est. ≤5 ms
                    </>
                  ),
                  tone: "from-primary to-accent",
                }
              : {
                  v: "<50 ms",
                  label: (<><span className="text-foreground font-medium">Edge inference latency target</span> · STM32N6 ONNX path (run <code>export_lstm_onnx.py</code> to populate)</>),
                  tone: "from-primary to-accent",
                },
          ] as const).map((s, i) => (
            <Card key={i}>
              <CardBody>
                <div className={`text-3xl sm:text-4xl md:text-5xl font-semibold tabular-nums bg-gradient-to-br ${s.tone} bg-clip-text text-transparent`}>
                  {s.v}
                </div>
                <div className="text-sm text-muted mt-2 leading-relaxed">{s.label}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Three pillars */}
      <section className="space-y-8">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Software platform</div>
          <h2 className="text-3xl font-semibold tracking-tight max-w-2xl">
            Hardware-Defined, Software-Augmented.
          </h2>
          <p className="mt-3 text-muted max-w-2xl">
            We don&rsquo;t sell a cheaper BBU &mdash; we sell an integrated{" "}
            <span className="text-foreground font-medium">rack-level system</span> that simultaneously solves{" "}
            <span className="text-foreground font-medium">millisecond transients</span>, the{" "}
            <span className="text-foreground font-medium">HVDC transition</span>, and{" "}
            <span className="text-foreground font-medium">ops-side observability</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PillarCard
            href="/twin"
            icon={<Cpu className="h-5 w-5" />}
            kicker="01"
            title="Battery Digital Twin"
            body={
              <>
                <span className="text-foreground font-medium">PyBaMM DFN physics</span> +{" "}
                <span className="text-foreground font-medium">LSTM RUL</span> trained on{" "}
                <span className="text-foreground font-medium">188 LFP cells</span> (138 Severson 2019 + 50 Severson-anchored synthetic BBU-duty),
                with 90 % prediction intervals from{" "}
                <span className="text-success font-medium">MC Dropout + split conformal</span> (PIs 44 % sharper, ≥90 % coverage held).
                Cloud trains, edge (STM32N6) infers; OTA weight updates are W3+ roadmap.
              </>
            }
            cta="Run physics simulation"
          />
          <PillarCard
            href="/tco"
            icon={<BarChart3 className="h-5 w-5" />}
            kicker="02"
            title="TCO Calculator"
            body={
              <>
                B2B lead-gen: feed rack count, electricity price, and current BBU spec — get{" "}
                <span className="text-foreground font-medium">10-year TCO, ROI, and CO₂ savings</span> out the other side.
                Drives LinkedIn ad funnel.
              </>
            }
            cta="Calculate savings"
          />
          <PillarCard
            href="/dashboard"
            icon={<Activity className="h-5 w-5" />}
            kicker="03"
            title="Fleet Health Dashboard"
            body={
              <>
                Visualizes the <span className="text-foreground font-medium">three service tiers</span> — real-time monitoring, proactive maintenance, predictive ops — across a{" "}
                <span className="text-foreground font-medium">1,000-device synthetic fleet</span> weighted to Texas + Virginia.
              </>
            }
            cta="Open dashboard"
          />
        </div>
      </section>

      {/* The competitive angle */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Why now</div>
            <h2 className="text-3xl font-semibold tracking-tight">A specific gap in the power-protection stack.</h2>
            <p className="mt-4 text-muted leading-relaxed">
              Microsoft Azure published the underlying problem (arXiv 2508.14318): LLM-training compute&ndash;sync cycles
              swing rack power <span className="text-foreground font-medium">&plusmn;30 % over 1&ndash;50 ms</span>.
              NVIDIA put capacitors inside the GB300 PSU; we put a{" "}
              <span className="text-foreground font-medium">hybrid LFP+LIC buffer at the rack level</span> so existing ORV3 deployments don&rsquo;t need PSU swaps.
            </p>
            <p className="mt-4 text-muted leading-relaxed">
              Every major incumbent already has rack-level products. We don&rsquo;t claim category creation —
              we claim a specific gap at the <span className="text-foreground font-medium">BBU layer</span>{" "}
              (between PSU caps and UPS) for the <span className="text-foreground font-medium">Tier-2/3 AI segment</span> that needs sub-second
              transient absorption without forklifting their existing UPS.
            </p>
          </div>
          <Card>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <Zap className="h-4 w-4" />
                The 5 kJ / rack rule
              </div>
              <p className="text-sm text-muted leading-relaxed">
                One GB200 NVL72 rack pulls <span className="text-foreground font-medium">120 kW</span>; a &plusmn;30 %
                swing over 100 ms costs about <span className="text-foreground font-medium">3.6 kJ</span> in
                buffered energy. With 30 % margin and back-to-back triggers, the design target is{" "}
                <span className="text-foreground font-medium">~5 kJ/rack</span>.
              </p>
              <p className="text-sm text-muted leading-relaxed">
                We over-provision to <span className="text-foreground font-medium">345 kJ</span> via{" "}
                <span className="text-foreground font-medium">2× off-the-shelf Eaton XLR 48 V LIC modules</span>.
                The <span className="text-success font-medium">69× headroom</span> is deliberate: lower ESR,{" "}
                <span className="text-foreground">low DoD (1.5 %)</span> extends LIC life to{" "}
                <span className="text-foreground">10⁷ cycles</span>, N+1 redundancy, and avoids a{" "}
                <span className="text-foreground">USD 50k+ NRE</span> for a custom 5 kJ pack.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
                <Mini label="Need" value="5 kJ" />
                <Mini label="Configured" value="345 kJ" />
                <Mini label="Headroom" value="69×" tone="text-success" />
              </div>
              <p className="text-[10px] text-muted/80 leading-relaxed pt-1">
                <span className="text-muted">Headroom 69×</span> = configured capacity ÷ §E.1 5 kJ design need.
                The <span className="text-muted">/twin</span> page reports a separate <span className="text-muted">~26×</span>{" "}
                ratio = capacity ÷ <em>actual</em> cumulative excursion under the demo waveform (13.3 kJ).
                Two denominators, both correct — landing shows structural over-provision, /twin shows operational margin.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Where we sit in the stack — layer-by-layer competitive landscape.
          Honest framing: incumbents already cover their layers. Sysblade
          claims the BBU layer + embedded Twin SaaS, not category creation. */}
      <section className="space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Competitive landscape</div>
          <h2 className="text-3xl font-semibold tracking-tight max-w-3xl">
            Where Sysblade sits in the power-protection stack.
          </h2>
          <p className="mt-3 text-muted max-w-3xl leading-relaxed">
            Each layer below has incumbents — the case for Sysblade isn&rsquo;t
            &ldquo;nobody else does this,&rdquo; it&rsquo;s
            <span className="text-foreground"> &ldquo;the hybrid LFP+LIC BBU + embedded Twin is the specific combination missing at the BBU layer for AI racks.&rdquo;</span>
          </p>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-muted text-[10px] uppercase tracking-wider border-b border-border">
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">Layer</th>
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">Incumbents</th>
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">Time window covered</th>
                <th className="text-left py-2.5">How Sysblade differs</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap">PSU caps</td>
                <td className="py-3 pr-3 text-muted">
                  NVIDIA GB300 (PSU-internal film/electrolytic capacitors)
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">1&ndash;10 ms</td>
                <td className="py-3 text-muted leading-relaxed">
                  PSU-internal &mdash; requires <span className="text-foreground">new boards</span>.
                  Sysblade is rack-external, drops into existing ORV3 / OCP racks without PSU swap.
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap text-success">
                  BBU (rack-level)
                </td>
                <td className="py-3 pr-3 text-muted">
                  OEM BBU vendors (Murata / Delta / Lite-On); single-chemistry NMC packs;
                  Eaton XLR sells the LIC modules we use
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">10&nbsp;ms &ndash; 60&nbsp;s</td>
                <td className="py-3 text-muted leading-relaxed">
                  <span className="text-success font-medium">Sysblade&rsquo;s layer.</span>{" "}
                  Hybrid <span className="text-foreground">LFP&nbsp;+&nbsp;LIC</span> + embedded
                  digital twin RUL is the specific combination missing here. Eaton sells the
                  cap, not the integrated system.
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap">Rack UPS</td>
                <td className="py-3 pr-3 text-muted">
                  Schneider Galaxy VS, Vertiv Liebert APM/GXT, Eaton 9395 / BladeUPS
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">60 s &ndash; tens of min</td>
                <td className="py-3 text-muted leading-relaxed">
                  Adjacent layer &mdash; Sysblade <span className="text-foreground">complements</span>
                  these (BBU handles sub-second transients before the UPS even notices), it
                  does not replace them.
                </td>
              </tr>
              <tr className="border-b border-border align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap">Facility UPS</td>
                <td className="py-3 pr-3 text-muted">
                  Schneider Galaxy VS (large), Eaton 9395P, Vertiv Liebert EXM
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">minutes &ndash; hours</td>
                <td className="py-3 text-muted leading-relaxed">
                  Different scale entirely. Sysblade doesn&rsquo;t target facility power
                  protection; we sit <em>upstream</em> of the rack.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-3 pr-3 font-medium whitespace-nowrap text-success">
                  RUL software
                </td>
                <td className="py-3 pr-3 text-muted">
                  Generic anomaly-detection SaaS (DataDog telemetry, Splunk ITSI);
                  Schneider EcoStruxure (facility-focused)
                </td>
                <td className="py-3 pr-3 text-muted whitespace-nowrap">N/A (continuous)</td>
                <td className="py-3 text-muted leading-relaxed">
                  Generic anomaly tools don&rsquo;t understand battery physics.{" "}
                  <span className="text-success font-medium">Sysblade Twin</span> is
                  PyBaMM-DFN + Severson-calibrated LSTM + conformal PIs &mdash; the SaaS layer
                  is grounded in cell chemistry, not statistical thresholds.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted leading-relaxed max-w-3xl">
          The 5 kJ / rack design point sits squarely in the &ldquo;tens of milliseconds&rdquo;
          gap between PSU caps and rack UPS &mdash; the layer where the AI-training workload
          characteristic creates new demand that incumbents&rsquo; legacy product lines
          weren&rsquo;t designed for. We compete head-on at the BBU layer (against OEM BBU
          vendors with single-chemistry packs) and the RUL software layer (against generic
          anomaly-detection SaaS), and partner with the UPS layer above us.
        </p>
      </section>
    </div>
  );
}

function PillarCard({
  href, icon, kicker, title, body, cta,
}: {
  href: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  body: React.ReactNode;
  cta: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-mono tracking-widest">{kicker}</span>
            <span className="text-muted group-hover:text-primary transition-colors">{icon}</span>
          </div>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="text-sm text-muted leading-relaxed">{body}</p>
          <div className="pt-2 inline-flex items-center gap-1 text-sm text-primary group-hover:gap-2 transition-all">
            {cta} <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function Mini({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
