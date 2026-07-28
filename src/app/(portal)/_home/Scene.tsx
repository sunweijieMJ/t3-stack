'use client';

import { Float, Icosahedron, Sparkles, Torus } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';

const GREEN = '#00a852';
const INK = '#111312';

/**
 * KV 主体 —— 一个缓慢自转的「学术核」：
 * 内核是近黑的实体、只在边缘透出绿色自发光，外层套一圈极细的
 * wireframe 晶格与三道倾斜轨道环。整体只用绿与墨两色，
 * 与参考站「留白 + 单一强调色」的克制一致。
 */
function AcademicCore({ still }: { still: boolean }) {
  const core = useRef<Mesh>(null);
  const lattice = useRef<Group>(null);
  const orbits = useRef<Group>(null);
  // 相机位置固定，窄视口下主体会撑满整屏并压住标题；
  // 按宽度等比缩小（useThree 在 resize 时会重渲染，故能跟随旋屏）
  const width = useThree((state) => state.size.width);
  const scale = Math.min(1, Math.max(0.42, width / 1100));

  useFrame((_, delta) => {
    if (still) return;
    if (core.current) core.current.rotation.y += delta * 0.08;
    if (lattice.current) {
      lattice.current.rotation.y -= delta * 0.04;
      lattice.current.rotation.x += delta * 0.015;
    }
    if (orbits.current) {
      orbits.current.rotation.z += delta * 0.05;
      orbits.current.rotation.x -= delta * 0.02;
    }
  });

  return (
    <Float
      floatIntensity={still ? 0 : 0.5}
      rotationIntensity={still ? 0 : 0.2}
      scale={scale}
      speed={still ? 0 : 1}
    >
      <Icosahedron args={[1.2, 6]} ref={core}>
        {/* 近黑高粗糙度：内核只在边缘吃到一点绿光，
            主角让给外层晶格与轨道环，避免变成一颗实心绿球 */}
        <meshPhysicalMaterial
          clearcoat={0.6}
          clearcoatRoughness={0.5}
          color="#060b08"
          emissive={GREEN}
          emissiveIntensity={0.05}
          metalness={0.75}
          roughness={0.5}
        />
      </Icosahedron>

      {/* 晶格外壳：极低透明度的白线，负责勾出体积 */}
      <group ref={lattice}>
        <Icosahedron args={[1.92, 2]}>
          <meshBasicMaterial
            color="#ffffff"
            opacity={0.16}
            transparent
            wireframe
          />
        </Icosahedron>
      </group>

      {/* 三道轨道环：细到接近线条，是画面里唯一的绿色硬边 */}
      <group ref={orbits}>
        {[
          [0, 0, 0],
          [Math.PI / 2.4, 0.5, 0],
          [0.6, Math.PI / 2.6, 0],
        ].map(([x, y, z], i) => (
          <Torus
            args={[2.55 + i * 0.18, 0.006, 3, 160]}
            key={`orbit-${i}`}
            rotation={[x ?? 0, y ?? 0, z ?? 0]}
          >
            <meshBasicMaterial
              color={i === 1 ? GREEN : '#ffffff'}
              opacity={i === 1 ? 0.85 : 0.3}
              transparent
            />
          </Torus>
        ))}
      </group>
    </Float>
  );
}

// 鼠标视差：相机随指针轻微位移并始终注视原点，营造纵深感。
function ParallaxCamera({ still }: { still: boolean }) {
  useFrame((state) => {
    if (still) return;
    const x = state.pointer.x * 0.45;
    const y = state.pointer.y * 0.3;
    state.camera.position.x += (x - state.camera.position.x) * 0.03;
    state.camera.position.y += (y - state.camera.position.y) * 0.03;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function Scene() {
  const still = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // KV 只占首屏一块，而首页很长。默认的 frameloop='always' 会在用户滚到页面
  // 底部之后仍然逐帧渲染 WebGL，纯属白烧电。用 IntersectionObserver 盯住 canvas
  // 本身，离开视口就切到 'demand'（只在 invalidate 时渲染，等于停机）。
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 6.4], fov: 42 }}
      // 上限压到 1.75：高分屏下 2x 对这个几乎全是线条的场景收益有限
      dpr={[1, 1.75]}
      // reduced-motion 下所有 useFrame 都直接 return、画面是静止的，
      // 没有理由继续跑渲染循环；'demand' 会在挂载时渲染一帧后停住。
      frameloop={still || !inView ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: true }}
      ref={canvasRef}
    >
      <Suspense fallback={null}>
        <fog args={[INK, 6, 15]} attach="fog" />
        <ambientLight intensity={0.22} />
        <directionalLight intensity={1.1} position={[4, 6, 5]} />
        <pointLight color={GREEN} intensity={14} position={[-5, -2, 3]} />
        <AcademicCore still={still} />
        <Sparkles
          color="#ffffff"
          count={90}
          noise={0.6}
          opacity={0.5}
          scale={[13, 8, 8]}
          size={2}
          speed={still ? 0 : 0.2}
        />
        <Sparkles
          color={GREEN}
          count={36}
          opacity={0.8}
          scale={[9, 6, 6]}
          size={3.5}
          speed={still ? 0 : 0.3}
        />
        <ParallaxCamera still={still} />
      </Suspense>
    </Canvas>
  );
}
