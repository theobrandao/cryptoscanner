import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Ilustrações autorais (SVG vetorial, sem imagens de terceiros) para cada aula da Jornada.
 * Usam as cores do tema, então acompanham o modo claro/escuro. Preços e níveis são esquemáticos.
 */
const C = {
  up: "var(--success)",
  down: "var(--danger)",
  p: "var(--primary)",
  a: "var(--accent)",
  w: "var(--warning)",
  m: "var(--muted-foreground)",
  b: "var(--border)",
};

type Candle = [number, number, number, number]; // x, open, close (y em px), largura implícita
function Candles({
  data,
  w = 10,
  wick = 8,
}: {
  data: Candle[];
  w?: number;
  wick?: number;
}) {
  return (
    <g>
      {data.map(([x, o, c], i) => {
        const up = c < o;
        const top = Math.min(o, c);
        const h = Math.max(2, Math.abs(o - c));
        return (
          <g key={i}>
            <line
              x1={x}
              x2={x}
              y1={top - wick}
              y2={top + h + wick * 0.7}
              stroke={up ? C.up : C.down}
              strokeWidth={1.5}
            />
            <rect
              x={x - w / 2}
              y={top}
              width={w}
              height={h}
              rx={1.5}
              fill={up ? C.up : C.down}
            />
          </g>
        );
      })}
    </g>
  );
}

function Grid() {
  return (
    <g opacity={0.35}>
      {[40, 80, 120, 160].map((y) => (
        <line
          key={y}
          x1={0}
          x2={320}
          y1={y}
          y2={y}
          stroke={C.b}
          strokeDasharray="2 4"
        />
      ))}
    </g>
  );
}

const Label = ({
  x,
  y,
  children,
  fill = C.m,
  anchor = "start",
  size = 10,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  size?: number;
}) => (
  <text
    x={x}
    y={y}
    fill={fill}
    fontSize={size}
    fontWeight={600}
    textAnchor={anchor}
    fontFamily="inherit"
  >
    {children}
  </text>
);

const ART: Record<string, () => React.ReactElement> = {
  "o-que-e-bitcoin": () => (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${22 + i * 74} 58)`}>
          <rect
            width={54}
            height={54}
            rx={8}
            fill="none"
            stroke={i === 3 ? C.w : C.p}
            strokeWidth={2}
          />
          <rect
            x={8}
            y={10}
            width={38}
            height={5}
            rx={2}
            fill={C.m}
            opacity={0.5}
          />
          <rect
            x={8}
            y={21}
            width={28}
            height={5}
            rx={2}
            fill={C.m}
            opacity={0.35}
          />
          <rect
            x={8}
            y={32}
            width={34}
            height={5}
            rx={2}
            fill={C.m}
            opacity={0.35}
          />
          <Label
            x={27}
            y={70}
            anchor="middle"
            size={9}
          >{`#${840_000 + i}`}</Label>
          {i < 3 ? (
            <line
              x1={54}
              x2={74}
              y1={27}
              y2={27}
              stroke={C.a}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          ) : null}
        </g>
      ))}
      <g transform="translate(250 22)">
        <circle r={14} cx={0} cy={0} fill={C.w} />
        <Label x={0} y={5} anchor="middle" fill="#fff" size={15}>
          ₿
        </Label>
      </g>
      <Label x={22} y={30} fill={C.p} size={11}>
        blocos encadeados por hash
      </Label>
      <Label x={22} y={44} size={9}>
        recompensa ÷ 2 a cada 210.000 blocos
      </Label>
    </g>
  ),
  "candles-e-timeframes": () => (
    <g>
      <Grid />
      <Candles
        data={[
          [30, 120, 100, 0],
          [52, 102, 112, 0],
          [74, 110, 86, 0],
          [96, 88, 70, 0],
          [118, 72, 82, 0],
          [140, 80, 60, 0],
        ]}
      />
      <g transform="translate(200 30)">
        <line x1={30} x2={30} y1={0} y2={120} stroke={C.up} strokeWidth={2} />
        <rect x={12} y={30} width={36} height={60} rx={3} fill={C.up} />
        {[
          [0, "máxima"],
          [30, "fechamento"],
          [90, "abertura"],
          [120, "mínima"],
        ].map(([y, t]) => (
          <g key={t as string}>
            <line
              x1={50}
              x2={70}
              y1={y as number}
              y2={y as number}
              stroke={C.m}
              strokeDasharray="2 2"
            />
            <Label x={74} y={(y as number) + 4} size={9}>
              {t}
            </Label>
          </g>
        ))}
      </g>
      {/* barras de volume */}
      {[14, 9, 22, 30, 11, 26].map((h, i) => (
        <rect
          key={i}
          x={25 + i * 22}
          y={168 - h}
          width={10}
          height={h}
          fill={C.a}
          opacity={0.5}
          rx={1}
        />
      ))}
    </g>
  ),
  "suporte-resistencia": () => (
    <g>
      <Grid />
      <rect x={0} y={40} width={320} height={10} fill={C.down} opacity={0.15} />
      <rect x={0} y={130} width={320} height={10} fill={C.up} opacity={0.15} />
      <polyline
        points="10,120 40,48 75,132 110,50 145,134 180,60 215,128 250,70 290,30 312,20"
        fill="none"
        stroke={C.p}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {(
        [
          [40, 48],
          [110, 50],
          [75, 132],
          [145, 134],
          [215, 128],
        ] as const
      ).map(([x, y]) => (
        <circle
          key={`${x}`}
          cx={x}
          cy={y}
          r={4}
          fill="var(--card)"
          stroke={y < 90 ? C.down : C.up}
          strokeWidth={2}
        />
      ))}
      <Label x={316} y={62} anchor="end" fill={C.down}>
        resistência
      </Label>
      <Label x={316} y={156} anchor="end" fill={C.up}>
        suporte
      </Label>
      <Label x={272} y={24} anchor="end" fill={C.p}>
        rompimento
      </Label>
    </g>
  ),
  "medias-moveis": () => (
    <g>
      <Grid />
      <path
        d="M0 150 C60 140 100 120 150 100 S250 60 320 40"
        fill="none"
        stroke={C.w}
        strokeWidth={2}
      />
      <path
        d="M0 160 C80 150 140 135 200 118 S280 90 320 80"
        fill="none"
        stroke={C.a}
        strokeWidth={2}
      />
      <polyline
        points="0,140 30,120 55,128 80,100 105,110 130,82 160,95 190,70 215,78 245,52 270,60 300,34 320,30"
        fill="none"
        stroke={C.p}
        strokeWidth={2.5}
      />
      <circle
        cx={160}
        cy={95}
        r={6}
        fill="none"
        stroke={C.up}
        strokeWidth={2}
      />
      <Label x={168} y={112} fill={C.up}>
        pullback na EMA
      </Label>
      <Label x={8} y={20} fill={C.w}>
        EMA 25
      </Label>
      <Label x={60} y={20} fill={C.a}>
        EMA 100
      </Label>
      <Label x={122} y={20} fill={C.p}>
        preço
      </Label>
    </g>
  ),
  "rsi-stochrsi-macd": () => (
    <g>
      <rect x={0} y={28} width={320} height={30} fill={C.down} opacity={0.12} />
      <rect x={0} y={122} width={320} height={30} fill={C.up} opacity={0.12} />
      <line
        x1={0}
        x2={320}
        y1={58}
        y2={58}
        stroke={C.down}
        strokeDasharray="4 3"
      />
      <line
        x1={0}
        x2={320}
        y1={122}
        y2={122}
        stroke={C.up}
        strokeDasharray="4 3"
      />
      <path
        d="M0 100 C30 60 50 30 80 45 S120 130 150 138 S200 70 230 50 S280 120 320 90"
        fill="none"
        stroke={C.p}
        strokeWidth={2.5}
      />
      <Label x={6} y={22} fill={C.down}>
        70 · sobrecomprado
      </Label>
      <Label x={6} y={170} fill={C.up}>
        30 · sobrevendido
      </Label>
      <Label x={314} y={22} anchor="end">
        RSI(14)
      </Label>
    </g>
  ),
  "padroes-graficos": () => (
    <g>
      <Grid />
      <polyline
        points="10,150 45,95 70,120 115,40 160,120 190,92 225,150"
        fill="none"
        stroke={C.p}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <polyline
        points="225,150 260,128 312,168"
        fill="none"
        stroke={C.down}
        strokeWidth={2.5}
        strokeDasharray="5 4"
      />
      <line x1={40} x2={250} y1={121} y2={121} stroke={C.w} strokeWidth={2} />
      <Label x={45} y={88} anchor="middle">
        ombro
      </Label>
      <Label x={115} y={32} anchor="middle">
        cabeça
      </Label>
      <Label x={190} y={85} anchor="middle">
        ombro
      </Label>
      <Label x={45} y={138} fill={C.w}>
        linha de pescoço
      </Label>
    </g>
  ),
  fibonacci: () => (
    <g>
      {[
        [30, "0%", C.m],
        [62, "23,6%", C.m],
        [82, "38,2%", C.a],
        [98, "50%", C.a],
        [114, "61,8%", C.w],
        [150, "100%", C.m],
      ].map(([y, t, col]) => (
        <g key={t as string}>
          <line
            x1={0}
            x2={250}
            y1={y as number}
            y2={y as number}
            stroke={col as string}
            strokeDasharray="4 3"
            opacity={0.8}
          />
          <Label x={256} y={(y as number) + 4} fill={col as string}>
            {t}
          </Label>
        </g>
      ))}
      <rect x={0} y={98} width={250} height={16} fill={C.w} opacity={0.14} />
      <polyline
        points="10,150 90,30 150,112 230,40"
        fill="none"
        stroke={C.p}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <circle
        cx={150}
        cy={112}
        r={5}
        fill="var(--card)"
        stroke={C.up}
        strokeWidth={2}
      />
      <Label x={158} y={130} fill={C.up}>
        zona de ouro
      </Label>
    </g>
  ),
  "gestao-de-risco": () => (
    <g>
      <rect x={60} y={30} width={200} height={60} fill={C.up} opacity={0.16} />
      <rect
        x={60}
        y={90}
        width={200}
        height={30}
        fill={C.down}
        opacity={0.16}
      />
      <line x1={60} x2={260} y1={30} y2={30} stroke={C.up} strokeWidth={2} />
      <line x1={60} x2={260} y1={90} y2={90} stroke={C.p} strokeWidth={2} />
      <line
        x1={60}
        x2={260}
        y1={120}
        y2={120}
        stroke={C.down}
        strokeWidth={2}
      />
      <polyline
        points="20,140 60,90 100,104 140,70 180,82 220,40 250,32"
        fill="none"
        stroke={C.m}
        strokeWidth={2}
      />
      <Label x={266} y={34} fill={C.up}>
        alvo
      </Label>
      <Label x={266} y={94} fill={C.p}>
        entrada
      </Label>
      <Label x={266} y={124} fill={C.down}>
        stop
      </Label>
      <Label x={160} y={64} anchor="middle" fill={C.up} size={13}>
        2R
      </Label>
      <Label x={160} y={110} anchor="middle" fill={C.down} size={13}>
        1R
      </Label>
      <Label x={60} y={165}>
        arriscar 1% do capital por operação
      </Label>
    </g>
  ),
  "sentimento-e-derivativos": () => (
    <g transform="translate(160 140)">
      {[
        [C.down, 180, 216],
        ["#f97316", 216, 252],
        [C.w, 252, 288],
        ["#84cc16", 288, 324],
        [C.up, 324, 360],
      ].map(([col, a0, a1]) => {
        const r = 100;
        const rad = (d: number) => (d * Math.PI) / 180;
        const p0 = [
          Math.cos(rad(a0 as number)) * r,
          Math.sin(rad(a0 as number)) * r,
        ];
        const p1 = [
          Math.cos(rad(a1 as number)) * r,
          Math.sin(rad(a1 as number)) * r,
        ];
        return (
          <path
            key={a0 as number}
            d={`M${p0[0]} ${p0[1]} A${r} ${r} 0 0 1 ${p1[0]} ${p1[1]}`}
            fill="none"
            stroke={col as string}
            strokeWidth={18}
          />
        );
      })}
      <line
        x1={0}
        y1={0}
        x2={-52}
        y2={-62}
        stroke="var(--foreground)"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <circle r={7} fill="var(--foreground)" />
      <Label x={-100} y={24} anchor="middle" fill={C.down}>
        medo extremo
      </Label>
      <Label x={100} y={24} anchor="middle" fill={C.up}>
        ganância
      </Label>
    </g>
  ),
  "agentes-e-automacao": () => (
    <g transform="translate(110 90)">
      {[70, 48, 26].map((r) => (
        <circle key={r} r={r} fill="none" stroke={C.p} opacity={0.35} />
      ))}
      <path
        d="M0 0 L70 0 A70 70 0 0 0 49.5 -49.5 Z"
        fill={C.p}
        opacity={0.22}
      />
      <circle r={5} fill={C.p} />
      {[
        [35, -30, C.up],
        [-40, 22, C.w],
        [18, 50, C.a],
      ].map(([x, y, col]) => (
        <circle
          key={`${x}`}
          cx={x as number}
          cy={y as number}
          r={5}
          fill={col as string}
        />
      ))}
      <g transform="translate(96 -56)">
        {["BTC · rompimento 4H", "ETH · RSI < 30", "SOL · volume 2,4×"].map(
          (t, i) => (
            <g key={t} transform={`translate(0 ${i * 38})`}>
              <rect
                width={108}
                height={28}
                rx={6}
                fill="var(--card)"
                stroke={C.b}
              />
              <circle cx={12} cy={14} r={4} fill={[C.up, C.w, C.a][i]} />
              <Label x={22} y={18} size={9}>
                {t}
              </Label>
            </g>
          ),
        )}
      </g>
    </g>
  ),
  psicologia: () => (
    <g>
      <path
        d="M10 150 C60 150 80 60 130 40 C170 25 190 40 205 70 C225 110 240 150 280 140 C300 135 310 125 316 118"
        fill="none"
        stroke={C.p}
        strokeWidth={2.5}
      />
      {[
        [60, 118, "esperança", C.a],
        [130, 34, "euforia", C.up],
        [205, 64, "negação", C.w],
        [248, 150, "pânico", C.down],
        [306, 112, "calma", C.m],
      ].map(([x, y, t, col]) => (
        <g key={t as string}>
          <circle
            cx={x as number}
            cy={y as number}
            r={5}
            fill={col as string}
          />
          <Label
            x={x as number}
            y={(y as number) - 10}
            anchor="middle"
            fill={col as string}
          >
            {t}
          </Label>
        </g>
      ))}
      <Label x={10} y={172}>
        ciclo emocional do mercado
      </Label>
    </g>
  ),
  "simulacao-e-dca": () => (
    <g>
      <Grid />
      <polyline
        points="10,90 50,120 90,70 130,130 170,100 210,140 250,80 290,60 312,50"
        fill="none"
        stroke={C.m}
        strokeWidth={1.5}
        opacity={0.8}
      />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect
          key={i}
          x={18 + i * 38}
          y={160 - (i + 1) * 13}
          width={22}
          height={(i + 1) * 13}
          rx={3}
          fill={C.p}
          opacity={0.35 + i * 0.07}
        />
      ))}
      <Label x={12} y={22} fill={C.p}>
        aporte fixo todo mês
      </Label>
      <Label x={12} y={36} size={9}>
        preço médio suaviza a volatilidade
      </Label>
    </g>
  ),
};

export const HAS_ART = (slug: string) => slug in ART;

/** Ilustração da aula. `compact` para miniaturas nos cartões. */
export function LessonArt({
  slug,
  className,
  compact,
}: {
  slug: string;
  className?: string;
  compact?: boolean;
}) {
  const Art = ART[slug];
  if (!Art) return null;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border card-glow",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 320 180"
        className={cn("block h-full w-full", compact && "px-2 pb-1 pt-8")}
        preserveAspectRatio="xMidYMid meet"
      >
        <Art />
      </svg>
    </div>
  );
}

/** Imagem de abertura da página: trilha com 3 etapas (iniciante → intermediário → avançado). */
export function JourneyHeroArt({
  className,
  done,
}: {
  className?: string;
  done: number;
}) {
  const stops = [
    { x: 40, y: 140, t: "Iniciante", col: C.up },
    { x: 160, y: 80, t: "Intermediário", col: C.p },
    { x: 280, y: 36, t: "Avançado", col: C.w },
  ];
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden>
      <path
        d="M40 140 C90 140 100 80 160 80 S240 36 280 36"
        fill="none"
        stroke={C.b}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d="M40 140 C90 140 100 80 160 80 S240 36 280 36"
        fill="none"
        stroke="url(#jg)"
        strokeWidth={10}
        strokeLinecap="round"
        pathLength={12}
        strokeDasharray={`${done} 12`}
      />
      <defs>
        <linearGradient id="jg" x1="0" x2="1">
          <stop offset="0" stopColor="var(--success)" />
          <stop offset="0.5" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--warning)" />
        </linearGradient>
      </defs>
      {stops.map((s) => (
        <g key={s.t}>
          <circle
            cx={s.x}
            cy={s.y}
            r={13}
            fill="var(--card)"
            stroke={s.col}
            strokeWidth={3}
          />
          <circle cx={s.x} cy={s.y} r={5} fill={s.col} />
          <Label x={s.x} y={s.y + 30} anchor="middle" fill={s.col} size={11}>
            {s.t}
          </Label>
        </g>
      ))}
    </svg>
  );
}
