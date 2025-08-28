'use client'

import { useEffect, useState, useRef } from 'react'
import CountUp from 'react-countup'

interface AnimatedCounterProps {
  end: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
  delay?: number
}

export function AnimatedCounter({ 
  end, 
  duration = 2, 
  decimals = 0, 
  prefix = "", 
  suffix = "", 
  className = "",
  delay = 0
}: AnimatedCounterProps) {
  const [isVisible, setIsVisible] = useState(false)
  const counterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Add delay before starting animation
          setTimeout(() => {
            setIsVisible(true)
          }, delay)
        }
      },
      {
        threshold: 0.3,
        rootMargin: '0px 0px -100px 0px'
      }
    )

    if (counterRef.current) {
      observer.observe(counterRef.current)
    }

    return () => observer.disconnect()
  }, [delay])

  return (
    <div ref={counterRef} className={className}>
      {isVisible ? (
        <CountUp
          end={end}
          duration={duration}
          decimals={decimals}
          prefix={prefix}
          suffix={suffix}
          preserveValue
        />
      ) : (
        <span>{prefix}0{suffix}</span>
      )}
    </div>
  )
}