'use client';

import {
  Float,
  Icosahedron,
  MeshDistortMaterial,
  Sparkles,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import type { Group, Mesh } from 'three';

// 中央「知识核心」——一个缓慢自转、表面轻微扰动的发光多面体，
// 外层套一个 wireframe 外壳，象征学术殿堂 / 知识结构。
function KnowledgeCore() {
  const inner = useRef<Mesh>(null);
  const shell = useRef<Group>(null);

  useFrame((_, delta) => {
    if (inner.current) inner.current.rotation.y += delta * 0.12;
    if (shell.current) {
      shell.current.rotation.y -= delta * 0.05;
      shell.current.rotation.x += delta * 0.02;
    }
  });

  return (
    <Float floatIntensity={0.8} rotationIntensity={0.35} speed={1.4}>
      {/* 内核：扰动的发光实体 */}
      <Icosahedron args={[1.35, 4]} ref={inner}>
        <MeshDistortMaterial
          color="#4f46e5"
          distort={0.32}
          emissive="#4338ca"
          emissiveIntensity={0.55}
          metalness={0.85}
          roughness={0.18}
          speed={1.6}
        />
      </Icosahedron>
      {/* 外壳：青色 wireframe，缓慢反向自转 */}
      <group ref={shell}>
        <Icosahedron args={[1.95, 1]}>
          <meshBasicMaterial
            color="#22d3ee"
            opacity={0.28}
            transparent
            wireframe
          />
        </Icosahedron>
      </group>
    </Float>
  );
}

// 鼠标视差：相机随指针轻微位移并始终注视原点，营造纵深感。
function ParallaxCamera() {
  useFrame((state) => {
    const x = state.pointer.x * 0.6;
    const y = state.pointer.y * 0.4;
    state.camera.position.x += (x - state.camera.position.x) * 0.04;
    state.camera.position.y += (y - state.camera.position.y) * 0.04;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.6} />
        <pointLight color="#818cf8" intensity={80} position={[5, 5, 5]} />
        <pointLight color="#22d3ee" intensity={40} position={[-6, -3, 2]} />
        <KnowledgeCore />
        {/* 环绕星点粒子场 */}
        <Sparkles
          color="#a5b4fc"
          count={140}
          noise={1.2}
          opacity={0.9}
          scale={[12, 8, 8]}
          size={3}
          speed={0.35}
        />
        <Sparkles
          color="#67e8f9"
          count={60}
          opacity={0.7}
          scale={[9, 6, 6]}
          size={5}
          speed={0.5}
        />
        <ParallaxCamera />
      </Suspense>
    </Canvas>
  );
}
