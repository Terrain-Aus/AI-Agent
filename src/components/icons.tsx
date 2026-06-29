// Lightweight inline icon set (stroke-based, currentColor) — no icon dependency.

type P = { size?: number; className?: string }
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconDashboard = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
)
export const IconPlus = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconChat = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></svg>
)
export const IconDoc = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" /></svg>
)
export const IconWarning = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
)
export const IconDatabase = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3" /></svg>
)
export const IconSettings = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
)
export const IconBrain = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 6 18a3 3 0 0 0 6 0V5a2 2 0 0 0-2-2zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 18 18a3 3 0 0 1-6 0" /></svg>
)
export const IconSend = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" /></svg>
)
export const IconCheck = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M20 6 9 17l-5-5" /></svg>
)
export const IconArrow = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const IconBack = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
)
export const IconDownload = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
)
export const IconTruck = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
)
export const IconHard = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M2 18h20M4 18v-3a8 8 0 0 1 16 0v3M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
)
export const IconLogout = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
)
export const IconSpark = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
)
