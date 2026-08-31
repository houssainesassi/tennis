import React from 'react';
import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => <div className="w-full h-screen flex items-center justify-center text-white">Loading Space Tennis Scene...</div>
});

export default function Home() {
  return <GameCanvas />;
}
