'use client';

// Prevent static generation during build — only renders client-side
export const dynamic = "force-dynamic";

import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardRedirect() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/owner/dashboard');
      return;
    }

    if (user.role === 'OWNER') {
      router.push('/owner/dashboard');
    } else {
      router.push('/worker');
    }
  }, [user, router]);

  return <div className="p-4">Loading your workspace...</div>;
}
