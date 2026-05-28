import { BlockedPage } from '@/src/components/pages/BlockedPage';

export const metadata = {
  title: 'Restricted — Meridian',
  description: 'Meridian is not available in your jurisdiction.',
};

export default function Blocked() {
  return <BlockedPage />;
}
