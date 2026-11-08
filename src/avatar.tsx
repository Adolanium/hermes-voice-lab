import React, { useRef } from "react";
export function Avatar({
  params,
  onChange,
  active,
  cutaway = true,
}: {
  params: any;
  onChange: (v: any) => void;
  active: boolean;
  cutaway?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const j = params.jaw;
  const tx = 288 + params.tongueX * 51,
    ty = 254 - params.tongueY * 39;
  function drag(e: React.PointerEvent, name: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e, name);
  }
  function move(e: React.PointerEvent, name: string) {
    if (e.buttons !== 1) return;
    const svg = ref.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    onChange(
      name === "tongue"
        ? { tongueX: clamp((q.x - 288) / 51), tongueY: clamp((254 - q.y) / 39) }
        : name === "jaw"
          ? { jaw: clamp((q.y - 257) / 39) }
          : { lip: clamp((q.x - 333) / 28) },
    );
  }
  const handle = (name: string, x: number, y: number, color: string) => (
    <g
      className="vl-handle"
      role="slider"
      tabIndex={0}
      aria-label={`Drag ${name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(
        (name === "tongue" ? params.tongueX : name === "jaw" ? j : params.lip) *
          100,
      )}
      onPointerDown={(e) => drag(e, name)}
      onPointerMove={(e) => move(e, name)}
      onKeyDown={(e) => {
        const d =
          e.key === "ArrowRight" || e.key === "ArrowUp"
            ? 0.04
            : e.key === "ArrowLeft" || e.key === "ArrowDown"
              ? -0.04
              : 0;
        if (!d) return;
        e.preventDefault();
        const key =
          name === "tongue"
            ? e.key === "ArrowUp" || e.key === "ArrowDown"
              ? "tongueY"
              : "tongueX"
            : name === "jaw"
              ? "jaw"
              : "lip";
        onChange({ [key]: Math.max(0, Math.min(1, params[key] + d)) });
      }}
    >
      <circle
        cx={x}
        cy={y}
        r="12"
        fill="var(--vl-paper)"
        stroke={color}
        strokeWidth="2"
      />
      <circle cx={x} cy={y} r="4" fill={color} />
    </g>
  );
  return (
    <svg
      ref={ref}
      className="vl-avatar"
      viewBox="0 0 440 430"
      aria-label="Original right-facing Hermes character with interactive modeled vocal tract"
    >
      <defs>
        <pattern
          id="vl-grid"
          width="22"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".65" fill="var(--vl-line)" />
        </pattern>
      </defs>
      <rect width="440" height="430" fill="url(#vl-grid)" />
      <circle cx="228" cy="208" r="163" fill="none" stroke="var(--vl-line)" />
      <path
        d="M70 419 Q87 352 172 344 L188 302 260 304 274 351 Q332 360 350 419Z"
        fill="#211e25"
      />
      <path
        d="M185 294 185 344 Q219 371 265 344 L255 283Z"
        fill="#e9d3bd"
        stroke="#211e25"
        strokeWidth="2"
      />
      <path
        d="M129 170 Q123 94 210 81 Q291 80 312 144 L316 186 Q317 202 343 213 Q348 218 334 225 L338 237 Q350 244 339 250 L339 262 Q332 292 285 302 Q236 319 197 277 L161 251Z"
        fill="#f1dfc9"
        stroke="#211e25"
        strokeWidth="2.5"
      />
      <path
        d="M188 276 Q228 319 285 302 Q332 292 339 262 L339 250 Q323 247 310 250 L319 264 Q310 286 279 285 Q226 287 200 263Z"
        fill="#e4c8ad"
        transform={`translate(0 ${j * 15 - 5})`}
      />
      <path
        d="M139 289 Q76 260 88 178 Q97 72 184 52 Q271 27 309 116 L312 166 276 157 272 128 264 159 234 155 230 126 222 158 196 164 188 132 Q171 181 159 212 L156 304 Q148 349 115 352 Q77 353 73 319 Q91 344 110 321 Q125 300 119 258Z"
        fill="#211e25"
      />
      <path
        d="M164 60 Q229 39 277 111 L285 143 Q272 149 279 157 L271 171 Q292 159 291 148 L299 143 Q283 69 225 48Z"
        fill="#fcf8ee"
      />
      <path
        d="M171 172 Q160 224 173 302 Q179 345 154 364 Q128 385 102 361 Q129 376 141 343 Q149 314 143 282 L142 179Z"
        fill="#211e25"
      />
      <path
        d="M283 183 Q299 176 313 185 M288 188 Q300 194 310 186 L316 180"
        fill="none"
        stroke="#211e25"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M298 187 300 198 M305 189 309 197"
        stroke="#211e25"
        strokeWidth="2"
      />
      <path
        d="M316 220 Q323 223 328 219"
        fill="none"
        stroke="#a27965"
        strokeWidth="2"
      />
      <g opacity={cutaway ? 1 : 0} aria-hidden={!cutaway}>
        <path d="M247 260 Q243 217 280 208 Q306 201 331 215" fill="none" stroke="#a45e3b" strokeWidth={3 + (params.nasal || 0) * 5} opacity=".65" />
        <title>Stylized oral and nasal paths; airflow animation is slowed for illustration.</title>
        <path
          d={`M235 328 L235 268 Q237 230 273 228 L332 237 L${340 + params.lip * 8} ${242 + j * 7} L329 ${251 + j * 16} L282 ${264 + j * 8} Q259 267 258 291 L258 328Z`}
          fill="#6a485f"
          fillOpacity=".87"
          stroke="#7b526a"
          strokeWidth="1.5"
        />
        <path
          d={`M259 286 Q261 256 ${tx} ${ty} Q321 ${ty - 7} 329 ${251 + j * 12} Q295 ${269 + j * 6} 259 286Z`}
          fill="#c78e7f"
          stroke="#e4b5a3"
          strokeWidth="2"
        />
      </g>
      <path
        d={`M331 237 Q${350 + params.lip * 9} 237 ${340 + params.lip * 8} ${242 + j * 7} M329 ${251 + j * 16} Q350 ${251 + j * 18} ${340 + params.lip * 8} ${246 + j * 9}`}
        fill="none"
        stroke="#8d4c57"
        strokeWidth="3"
      />
      {cutaway && (
        <path
          d="M246 326 246 287"
          stroke="#f2ddbc"
          strokeWidth={active ? 5 : 2}
          strokeDasharray="3 6"
          className={active ? "vl-air active" : "vl-air"}
        />
      )}
      <g fontFamily="inherit" fontSize="10" fill="var(--vl-muted)">
        <path
          d="M235 319 205 319 205 385"
          fill="none"
          stroke="var(--vl-line)"
        />
        <text x="180" y="400">
          VOICE SOURCE
        </text>
        <path
          d="M358 227 392 227 392 187"
          fill="none"
          stroke="var(--vl-line)"
        />
        <text x="370" y="177">
          LIPS
        </text>
        <path d="M296 290 372 313" fill="none" stroke="var(--vl-line)" />
        <text x="375" y="319">
          JAW
        </text>
      </g>
      {handle("tongue", tx, ty, "#f0c18a")}
      {handle("jaw", 293, 257 + j * 39, "#986c90")}
      {handle("lip", 333 + params.lip * 28, 244 + j * 10, "#b36e48")}
      <text
        x="20"
        y="30"
        fill="var(--vl-muted)"
        fontSize="10"
        letterSpacing="1.8"
      >
        DRAG THE THREE HANDLES
      </text>
    </svg>
  );
}
