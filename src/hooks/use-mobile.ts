import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // Nilai awal disetel lewat microtask supaya tidak memicu render
    // beruntun sinkron di dalam effect (aturan set-state-in-effect).
    void Promise.resolve().then(onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
