import { GlobalAnalytics } from './global-analytics';
import { TrailGame } from './trail-game';

export const dynamic = 'force-dynamic';

export default function Home() {
  return process.env.APP_MODE === 'analytics' ? (
    <GlobalAnalytics />
  ) : (
    <TrailGame />
  );
}
