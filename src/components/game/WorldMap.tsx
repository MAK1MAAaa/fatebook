export function Compass({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="none"
        stroke="currentColor"
        strokeWidth=".7"
      />
      <circle
        cx="50"
        cy="50"
        r="27"
        fill="none"
        stroke="currentColor"
        strokeWidth=".4"
      />
      <path
        d="M50 7 57 43 93 50 57 57 50 93 43 57 7 50 43 43Z"
        fill="none"
        stroke="currentColor"
      />
      <path
        d="m50 15 0 35-7-7Zm35 35H50l7-7ZM50 85V50l7 7ZM15 50h35l-7 7Z"
        fill="currentColor"
        opacity=".55"
      />
      <path
        d="m26 26 18 18m30-18L56 44m18 30L56 56m-30 18 18-18"
        stroke="currentColor"
        strokeWidth=".7"
      />
      <circle cx="50" cy="50" r="3" fill="currentColor" />
    </svg>
  );
}
export default function WorldMap({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={`world-map ${large ? "large-map" : ""}`}
      viewBox="0 0 650 400"
      role="img"
      aria-label="五大陆旅行示意地图，非精确地理比例"
    >
      <defs>
        <pattern
          id="mapGrid"
          width="30"
          height="30"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M30 0H0V30"
            fill="none"
            stroke="currentColor"
            opacity=".07"
          />
        </pattern>
      </defs>
      <rect width="650" height="400" fill="url(#mapGrid)" />
      <g
        fill="currentColor"
        fillOpacity=".08"
        stroke="currentColor"
        strokeOpacity=".55"
        strokeWidth="1.4"
        strokeLinejoin="round"
      >
        <path d="m82 63 42-16 35 9 27-12 24 14 45-4 30 32-18 26 12 18-13 20-35-3-14 35-30-8-19 24-28-14-25 5-9-27-20-12 7-24-21-32Z" />
        <path d="m397 51 31 9 30-15 23 22 42-5 38 27 13 38-30 17-5 30-38 7-16-24-31 2-24-17-33-2-5-35-20-22Z" />
        <path d="m316 225 26-22 24 10 24-10 31 17-2 29 24 18-11 34-27 3-10 29-37-6-17-26-29 1-15-30Z" />
        <path d="m82 244 30-18 35 12 23-6 21 19-8 34-31 7-6 27-31-6-8-26-31-6Z" />
        <path d="m509 275 25-11 16 12 29-7 25 21-18 22-35-5-21 13-20-18Z" />
      </g>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 5"
        opacity=".55"
      >
        <path d="M184 111Q279 28 464 111" />
        <path d="M464 111Q497 207 369 262" />
        <path d="M369 262Q271 201 184 111" />
        <path d="M184 111Q44 150 133 269" />
      </g>
      <g fill="currentColor">
        <circle cx="184" cy="111" r="4" />
        <circle cx="464" cy="111" r="4" />
        <circle cx="369" cy="262" r="4" />
        <circle cx="133" cy="269" r="4" />
      </g>
      <g
        fill="currentColor"
        fontSize="15"
        fontFamily="serif"
        textAnchor="middle"
      >
        <text x="184" y="143">
          中央大陆
        </text>
        <text x="465" y="145">
          魔大陆
        </text>
        <text x="371" y="285">
          米里斯大陆
        </text>
        <text x="136" y="296">
          贝加利特
        </text>
        <text x="550" y="340">
          天大陆
        </text>
      </g>
      <g stroke="currentColor" strokeWidth=".6" opacity=".5">
        <path
          d="m228 91 11-19 12 19m-4-5 10-17 14 23m-5-3 8-16 10 20M351 239l7-15 8 15m3 0 7-18 7 18M98 267l7-17 10 17"
          fill="none"
        />
      </g>
      <text
        x="35"
        y="370"
        fill="currentColor"
        fontSize="10"
        opacity=".65"
        letterSpacing="3"
      >
        THE SIX-FACED WORLD · 示意地图
      </text>
      <g
        transform="translate(597 46)"
        stroke="currentColor"
        fill="none"
        opacity=".6"
      >
        <circle r="17" />
        <path d="M0-27V27M-27 0H27M-12-12l24 24m0-24L-12 12" />
        <text
          y="-30"
          fill="currentColor"
          stroke="none"
          textAnchor="middle"
          fontSize="10"
        >
          N
        </text>
      </g>
    </svg>
  );
}
export function Landscape() {
  return (
    <svg
      className="landscape"
      viewBox="0 0 1200 500"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="land" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#333c36" />
          <stop offset="1" stopColor="#18251f" />
        </linearGradient>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#b9a483" stopOpacity="0" />
          <stop offset="1" stopColor="#b9a483" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <rect width="1200" height="500" fill="url(#sky)" />
      <circle cx="890" cy="110" r="55" fill="#d5c69d" opacity=".13" />
      <path
        d="m0 330 80-60 60 17 120-160 37 62 71-25 111 170 70-41 95 24 92-144 45 39 66-134 73 155 41-21 139 109v179H0Z"
        fill="#526052"
        opacity=".2"
      />
      <path
        d="m0 379 116-81 97 32 100-97 92 92 150 38 145-69 57 43 111-58 107 64 90-14 135 66v105H0Z"
        fill="#394c3d"
        opacity=".35"
      />
      <path
        d="M0 440q100-98 258-37t306 2q163-83 319-19t317 29v85H0Z"
        fill="url(#land)"
      />
      <g fill="#1a2922">
        <path d="m880 366 11-28 12 28-7-2 9 22h-29l10-23Zm55 13 10-30 13 30-7-2 9 26h-29l10-26Zm-43 0h2v34h-2Zm51 5h3v35h-3Z" />
      </g>
      <path
        d="M486 500q92-36 88-68t81-42"
        fill="none"
        stroke="#ad9a72"
        strokeWidth="5"
        opacity=".17"
      />
    </svg>
  );
}
