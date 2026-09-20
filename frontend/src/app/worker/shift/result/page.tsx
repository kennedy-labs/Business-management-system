'use client';
// Prevent static generation — client component with query
export const dynamic = "force-dynamic";
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/api';
import { useAuthStore } from '@/store/useAuthStore';

export default function ShiftResult() {
  const user = useAuthStore((state) => state.user);
  const businessId = user?.businessId as string | undefined;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shiftResult', businessId],
    queryFn: async () => {
      const response = await api.get('/reports/summary', {
        params: { businessId },
      });
      return response.data;
    },
    // Run only in browser, after the worker is authenticated
    // and their business is known.
    enabled: typeof window !== 'undefined' && !!businessId,
  });

  if (isError)
    return (
      <div className="text-red-700">
        Could not load shift results:{" "}
        {(error as any)?.response?.status
          ? `HTTP ${(error as any).response.status}`
          : (error as Error)?.message}
      </div>
    );

  if (isLoading || !data) return <div>Calculating shift results...</div>;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Shift Closed Successfully</h1>
      <pre className="bg-gray-100 p-4">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}
