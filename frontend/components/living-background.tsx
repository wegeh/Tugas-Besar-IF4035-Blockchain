"use client"

import { useEffect, useRef } from "react"

export function LivingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()

    window.addEventListener("resize", resizeCanvas)

    // Aurora borealis effect with animated gradient
    let animationId: number
    let time = 0

    const animate = () => {
      time += 0.0005

      // Clear with dark background
      ctx.fillStyle = "#0f172a"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Create multiple animated gradient blobs
      const blobs = [
        { x: 0.2, y: 0.3, size: 400, color1: "#10b981", color2: "#06b6d4" },
        { x: 0.8, y: 0.6, size: 500, color1: "#06b6d4", color2: "#059669" },
        { x: 0.5, y: 0.5, size: 350, color1: "#047857", color2: "#0891b2" },
      ]

      blobs.forEach((blob, i) => {
        const x = canvas.width * blob.x + Math.sin(time + i) * 100
        const y = canvas.height * blob.y + Math.cos(time + i * 1.5) * 100

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, blob.size)
        gradient.addColorStop(0, blob.color1 + "20")
        gradient.addColorStop(1, blob.color2 + "00")

        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resizeCanvas)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none aurora-bg" />
}
