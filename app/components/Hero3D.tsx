'use client'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, RoundedBox, Line, Environment, ContactShadows } from '@react-three/drei'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'

/* ── Карго хайрцаг — брэндийн өнгөтэй ── */
function CargoBox({
  position,
  size = [0.9, 0.7, 0.7],
  color = '#c96442',
  speed = 1,
  rotationIntensity = 0.6,
  floatIntensity = 1.2,
  delay = 0,
}: {
  position: [number, number, number]
  size?: [number, number, number]
  color?: string
  speed?: number
  rotationIntensity?: number
  floatIntensity?: number
  delay?: number
}) {
  return (
    <Float speed={speed} rotationIntensity={rotationIntensity} floatIntensity={floatIntensity}>
      <RoundedBox args={size} radius={0.06} smoothness={4} position={position}>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
      </RoundedBox>
      {/* Хайрцгийн тууз (tape) */}
      <mesh position={[position[0], position[1], position[2] + size[2] / 2 + 0.001]}>
        <planeGeometry args={[size[0] * 0.18, size[1]]} />
        <meshStandardMaterial color="#a04a2e" roughness={0.6} />
      </mesh>
    </Float>
  )
}

/* ── Нислэгийн зам — Суурин (Хятад) → Эрээн → УБ ── */
function FlightPath() {
  const points = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-5.5, -1.2, -1.5),
      new THREE.Vector3(-2.5, 0.8, 0.5),
      new THREE.Vector3(0.5, 1.4, 0),
      new THREE.Vector3(3, 0.4, -0.5),
      new THREE.Vector3(5.5, -0.8, -1),
    ])
    return curve.getPoints(80)
  }, [])

  return (
    <Line
      points={points}
      color="#c96442"
      lineWidth={1.5}
      dashed
      dashSize={0.25}
      gapSize={0.15}
      transparent
      opacity={0.45}
    />
  )
}

/* ── Зам дагуу хөдлөх жижиг хайрцаг ── */
function MovingParcel({ offset = 0, speed = 0.05, color = '#d97a53' }: { offset?: number; speed?: number; color?: string }) {
  const ref = useRef<THREE.Group>(null)
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-5.5, -1.2, -1.5),
        new THREE.Vector3(-2.5, 0.8, 0.5),
        new THREE.Vector3(0.5, 1.4, 0),
        new THREE.Vector3(3, 0.4, -0.5),
        new THREE.Vector3(5.5, -0.8, -1),
      ]),
    []
  )

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = ((clock.getElapsedTime() * speed + offset) % 1 + 1) % 1
    const pos = curve.getPointAt(t)
    ref.current.position.copy(pos)
    // Чиглэл рүү эргэх
    const tangent = curve.getTangentAt(t)
    ref.current.rotation.z = Math.atan2(tangent.y, tangent.x) * 0.3
  })

  return (
    <group ref={ref}>
      <RoundedBox args={[0.35, 0.28, 0.28]} radius={0.03} smoothness={4}>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} emissive={color} emissiveIntensity={0.15} />
      </RoundedBox>
    </group>
  )
}

/* ── Дэлхий бөмбөрцөг (wireframe, эргэдэг) ── */
function Globe() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.12
  })
  return (
    <mesh ref={ref} position={[0, -0.4, -3.5]}>
      <sphereGeometry args={[2.6, 24, 24]} />
      <meshBasicMaterial color="#c96442" wireframe transparent opacity={0.10} />
    </mesh>
  )
}

/* ── Үндсэн 3D төрөл ── */
export default function Hero3D({ accent = '#c96442' }: { accent?: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }} aria-hidden>
      <Canvas
        camera={{ position: [0, 0.6, 7], fov: 50 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.1} />
        <directionalLight position={[-4, 2, -3]} intensity={0.3} color="#ffd9c4" />

        <Globe />
        <FlightPath />

        {/* Зам дагуу нисэх хайрцагнууд */}
        <MovingParcel offset={0} speed={0.045} />
        <MovingParcel offset={0.35} speed={0.045} color="#e0885f" />
        <MovingParcel offset={0.7} speed={0.045} color="#b5562f" />

        {/* Статик бөөмс хайрцагнууд */}
        <CargoBox position={[-2.8, 1.6, -0.5]} color={accent} speed={1.4} delay={0} />
        <CargoBox position={[3.2, 1.3, -1]} color="#d97a53" size={[0.7, 0.55, 0.55]} speed={1.8} />
        <CargoBox position={[-4, -0.4, -2]} color="#b5562f" size={[0.6, 0.5, 0.5]} speed={1.1} />
        <CargoBox position={[4.3, 0.2, -2.2]} color={accent} size={[0.55, 0.45, 0.45]} speed={1.6} />

        <ContactShadows position={[0, -2.2, 0]} opacity={0.25} scale={14} blur={2.4} far={4} color="#7a3a22" />
      </Canvas>
    </div>
  )
}
