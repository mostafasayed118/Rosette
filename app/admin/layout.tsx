import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminShell } from '@/components/admin/AdminShell';
import { getCurrentAdmin } from '@/features/auth/server';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');

  return (
    <SidebarProvider>
      <AdminShell>{children}</AdminShell>
    </SidebarProvider>
  );
}
