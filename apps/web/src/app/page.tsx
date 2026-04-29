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
          OCP Mt. Diablo 400 ready · LFP + LIC hybrid · 2026 Q4 EVT
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
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
                  v: `${mv.latency.p99_ms.toFixed(1)} ms`,
                  label: (
                    <>
                      ONNX p99 on laptop CPU · <span className="text-success font-medium">{(50 / mv.latency.p99_ms).toFixed(0)}× under spec</span>{" "}
                      · STM32N6 NPU est. ≈5 ms
                    </>
                  ),
                  tone: "from-primary to-accent",
                }
              : {
                  v: "<50 ms",
                  label: (<><span className="text-foreground font-medium">Edge inference latency target</span> · STM32N6 ONNX path (W2)</>),
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
            We don&rsquo;t sell a cheaper BBU &mdash; we sell the only{" "}
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
                <span className="text-foreground font-medium">188 LFP cells</span> (138 Severson 2019 + 50 PyBaMM-calibrated BBU-duty),
                with 90 % prediction intervals from{" "}
                <span className="text-success font-medium">MC Dropout + split conformal</span> (PIs 44 % sharper, ≥90 % coverage held).
                Cloud trains, edge (STM32N6) infers, OTA updates weights.
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
            <h2 className="text-3xl font-semibold tracking-tight">The transient gap nobody is filling.</h2>
            <p className="mt-4 text-muted leading-relaxed">
              Microsoft Azure published the underlying problem (arXiv 2508.14318): LLM-training compute&ndash;sync cycles
              swing rack power <span className="text-foreground font-medium">&plusmn;30 % over 1&ndash;50 ms</span>.
              NVIDIA put capacitors inside the GB300 PSU; we put a{" "}
              <span className="text-foreground font-medium">hybrid LFP+LIC buffer at the rack level</span> so existing ORV3 deployments don&rsquo;t need PSU swaps.
            </p>
            <p className="mt-4 text-muted leading-relaxed">
              Schneider &times; NVIDIA chase 800 V hyperscalers. Vertiv chases facility-level UPS.
              The <span className="text-foreground font-medium">middle tier</span> &mdash; CoreWeave, Lambda, Equinix, Digital Realty &mdash; is left on hardware that wasn&rsquo;t designed for AI workloads.
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
            </CardBody>
          </Card>
        </div>
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
