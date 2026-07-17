import type { Metadata } from 'next';
import HomeView from './_home';

export const metadata: Metadata = {
  title: 'Home',
  description: 'Coming Soon',
};

export default function HomePage() {
  return <HomeView />;
}
