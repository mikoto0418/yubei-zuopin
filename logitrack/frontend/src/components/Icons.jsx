// 图标集：全部为内联 SVG（24x24 线性图标，stroke 用 currentColor）。
// 不引入图标库，避免额外依赖与打包体积；风格统一为 1.6px 线宽的 SF Symbols 感觉。

function Svg({ children, size = 18, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const TruckIcon = (p) => (
  <Svg {...p}>
    <path d="M3 7.5h11v9H3z" />
    <path d="M14 10.5h3.6l2.4 3v3H14z" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17.5" cy="18" r="1.8" />
  </Svg>
)

export const BoxIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3 4 7v10l8 4 8-4V7z" />
    <path d="M4 7l8 4 8-4M12 11v10" />
  </Svg>
)

export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-3.6-3.6" />
  </Svg>
)

export const BellIcon = (p) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Svg>
)

export const AlertIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4 2.8 20h18.4z" />
    <path d="M12 10v4.5M12 17.4v.1" />
  </Svg>
)

export const HubIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 3v6.6M12 14.4V21M3 12h6.6M14.4 12H21" />
    <circle cx="12" cy="3" r="1.4" />
    <circle cx="12" cy="21" r="1.4" />
    <circle cx="3" cy="12" r="1.4" />
    <circle cx="21" cy="12" r="1.4" />
  </Svg>
)

export const WarehouseIcon = (p) => (
  <Svg {...p}>
    <path d="M3 21V9l9-5 9 5v12" />
    <path d="M7 21v-7h10v7" />
    <path d="M7 17h10" />
  </Svg>
)

export const UsersIcon = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.2 2.5-5.4 5.5-5.4s5.5 2.2 5.5 5.4" />
    <path d="M16 5.4a3 3 0 0 1 0 5.6M17.5 14.9c2 .7 3.4 2.5 3.4 5.1" />
  </Svg>
)

export const ChartIcon = (p) => (
  <Svg {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 20v-6M12.5 20V8M17 20v-9" />
  </Svg>
)

export const MapPinIcon = (p) => (
  <Svg {...p}>
    <path d="M12 21s6.5-6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15 12 21 12 21z" />
    <circle cx="12" cy="10.4" r="2.4" />
  </Svg>
)

export const ClockIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.4V12l3.2 2" />
  </Svg>
)

export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12.8 9.6 17.4 19 8" />
  </Svg>
)

export const XIcon = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const RefreshIcon = (p) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
    <path d="M4 4.5V8h3.5" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
    <path d="M20 19.5V16h-3.5" />
  </Svg>
)

export const SparkIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Svg>
)

export const PlusIcon = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const ChevronRightIcon = (p) => (
  <Svg {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Svg>
)

export const ArrowRightIcon = (p) => (
  <Svg {...p}>
    <path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5" />
  </Svg>
)

export const LogoutIcon = (p) => (
  <Svg {...p}>
    <path d="M15 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
    <path d="M10 8.5 6.5 12 10 15.5M6.5 12H15" />
  </Svg>
)

export const SendIcon = (p) => (
  <Svg {...p}>
    <path d="M20.5 3.5 3.8 10.2l6.4 2.6 2.6 6.4z" />
    <path d="M20.5 3.5 10.2 12.8" />
  </Svg>
)

export const RouteIcon = (p) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M8.4 6H14a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h6.6" />
  </Svg>
)

export const ShieldIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6z" />
    <path d="M9.2 12.2 11.4 14.4 15 10.6" />
  </Svg>
)

export const ListIcon = (p) => (
  <Svg {...p}>
    <path d="M8 7h12M8 12h12M8 17h12M4 7v.01M4 12v.01M4 17v.01" />
  </Svg>
)

export const SlidersIcon = (p) => (
  <Svg {...p}>
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="16" cy="8" r="2" />
    <circle cx="10" cy="16" r="2" />
  </Svg>
)
